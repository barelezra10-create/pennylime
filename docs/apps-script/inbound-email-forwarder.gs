// PennyLime Inbound Email Forwarder
// ------------------------------------------------------------------
// Watches the info@pennylime.com inbox and forwards each new message
// (with attachments) to /api/inbound-email so it lands on the right
// contact's CRM timeline and, if it's a PDF/CSV, gets saved as a
// BANK_STATEMENT_90D Document on the linked application.
//
// SETUP:
//   1. Project Settings → Script properties → add INBOUND_EMAIL_SECRET
//      (must match the env var on the server).
//   2. Triggers → add time-driven trigger: "checkInbox" every 5 min.
//
// MAINTENANCE:
//   - To retroactively process a specific sender's most recent email
//     (e.g. when an Apps Script update goes live and an attachment-bearing
//     email from last week is sitting unprocessed in the inbox), call
//     reprocessFromSender("their.email@example.com") from the editor.

const WEBHOOK_URL = 'https://pennylime.com/api/inbound-email';
const MAX_THREADS_PER_RUN = 25;
// 20 MB per email cap (combined attachment payload). Apps Script's
// UrlFetchApp limit is 50 MB outbound; we leave headroom for headers
// and body. Per-attachment cap server-side is 15 MB.
const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;

function checkInbox() {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('INBOUND_EMAIL_SECRET');
  if (!secret) {
    console.error('Set INBOUND_EMAIL_SECRET in Project Settings → Script properties');
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const started = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const lastScan = Number(properties.getProperty('INBOUND_LAST_SCAN_AT'));
    // First run catches missed replies from the last month. Later runs overlap
    // the last complete scan by a day, independent of Gmail read/archive state.
    const since = lastScan > 0 ? lastScan - day : started - 30 * day;
    const known = properties.getProperties();
    for (const key of Object.keys(known)) {
      if (key.startsWith('INBOUND_FORWARDED_') && Number(known[key]) < since) {
        properties.deleteProperty(key);
      }
    }
    const query = '{to:info@pennylime.com cc:info@pennylime.com deliveredto:info@pennylime.com} -in:chats after:' + Math.floor(since / 1000);
    let processed = 0;
    let complete = true;
    for (let offset = 0; ; offset += MAX_THREADS_PER_RUN) {
      const threads = GmailApp.search(query, offset, MAX_THREADS_PER_RUN);
      for (const thread of threads) {
        for (const msg of thread.getMessages()) {
          if (Date.now() - started > 4 * 60 * 1000) {
            console.log('Time budget reached; remaining replies will retry next run.');
            return;
          }
          const received = msg.getDate().getTime();
          const key = 'INBOUND_FORWARDED_' + msg.getId();
          if (received < since || known[key] || msg.isDraft() || msg.isInTrash()) continue;
          // Gmail search returns whole threads, including our outbound messages.
          const recipients = [msg.getTo(), msg.getCc(), msg.getHeader('Delivered-To')].join(',');
          const isInboxAddress = /(^|[\s<,])info@pennylime\.com(?=$|[\s>,])/i;
          if (!isInboxAddress.test(recipients) || isInboxAddress.test(msg.getFrom())) continue;
          if (forwardMessage_(msg, secret)) {
            properties.setProperty(key, String(received));
            known[key] = String(received);
            processed++;
          } else {
            complete = false;
          }
        }
      }
      if (threads.length < MAX_THREADS_PER_RUN) break;
    }
    // Preserve the checkpoint on any failure, so failed messages remain eligible.
    if (complete) properties.setProperty('INBOUND_LAST_SCAN_AT', String(started));
    console.log('Processed ' + processed + ' message(s). Scan complete: ' + complete);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retroactively re-send a sender's most recent message to the
 * webhook even if it's already marked read. Run manually from the
 * Apps Script editor when you need to backfill — e.g. an attachment
 * fix shipped and a real email is sitting un-attached on a contact.
 */
function reprocessFromSender(senderEmail) {
  if (!senderEmail) {
    console.error('Pass a sender email: reprocessFromSender("them@example.com")');
    return;
  }
  const secret = PropertiesService.getScriptProperties().getProperty('INBOUND_EMAIL_SECRET');
  if (!secret) {
    console.error('Set INBOUND_EMAIL_SECRET in Project Settings → Script properties');
    return;
  }
  // newest 5 from this sender, regardless of read state
  const threads = GmailApp.search('from:' + senderEmail + ' to:info@pennylime.com', 0, 5);
  if (threads.length === 0) {
    console.warn('No messages from ' + senderEmail + ' found in info@ inbox');
    return;
  }
  // Use the most recent message across threads — find the one with attachments first
  let target = null;
  for (const thread of threads) {
    const msgs = thread.getMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.getFrom().toLowerCase().indexOf(senderEmail.toLowerCase()) === -1) continue;
      if (m.getAttachments().length > 0) { target = m; break; }
      if (!target) target = m; // fallback: most recent message even without attachments
    }
    if (target && target.getAttachments().length > 0) break;
  }
  if (!target) {
    console.warn('No matching message from ' + senderEmail);
    return;
  }
  console.log('Found message id=' + target.getId() + ' subject="' + target.getSubject() + '" attachments=' + target.getAttachments().length);
  const ok = forwardMessage_(target, secret);
  console.log(ok ? 'Forwarded OK.' : 'Forward failed — see error log above.');
}

/**
 * Internal — POSTs one message to the webhook with attachments.
 * Returns true on 2xx, false otherwise (and logs the error).
 */
function forwardMessage_(msg, secret) {
  try {
    const attachments = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
    const encodedAttachments = [];
    let totalAttachmentBytes = 0;
    for (const att of attachments) {
      const bytes = att.getBytes();
      // Skip empty files (Gmail sometimes lists 0-byte ICS forwarding stubs).
      if (!bytes || bytes.length === 0) continue;
      if (totalAttachmentBytes + bytes.length > MAX_PAYLOAD_BYTES) {
        console.warn('Skipping attachment "' + att.getName() + '" — payload size cap reached.');
        continue;
      }
      totalAttachmentBytes += bytes.length;
      encodedAttachments.push({
        filename: att.getName(),
        mimeType: att.getContentType(),
        contentBase64: Utilities.base64Encode(bytes),
      });
    }

    const payload = {
      from: msg.getFrom(),
      to: msg.getTo(),
      subject: msg.getSubject(),
      text: msg.getPlainBody(),
      html: msg.getBody(),
      messageId: msg.getId(),
      inReplyTo: msg.getHeader('In-Reply-To') || null,
      references: msg.getHeader('References') || null,
      receivedAt: msg.getDate().toISOString(),
      attachments: encodedAttachments,
    };

    const res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-inbound-secret': secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      const result = JSON.parse(res.getContentText());
      return result.ok === true;
    }
    console.error('POST failed ' + res.getResponseCode() + ' ' + res.getContentText().substring(0, 500));
    return false;
  } catch (err) {
    console.error('Error on message ' + msg.getId() + ': ' + err);
    return false;
  }
}

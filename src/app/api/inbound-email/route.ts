import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Max single attachment size — 15MB after base64 decode. */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** Max attachments per email. */
const MAX_ATTACHMENTS = 10;

/**
 * Provider-agnostic inbound email webhook.
 *
 * Any inbound-email provider that can POST JSON to a URL (Cloudflare
 * Email Workers, Postmark Inbound, SendGrid Inbound Parse, Mailgun
 * Routes, CloudMailin) can feed this endpoint. Authentication is a
 * simple shared secret in the `x-inbound-secret` header — must match
 * INBOUND_EMAIL_SECRET on the server.
 *
 * Expected JSON body (provider-agnostic shape, providers map their
 * own field names → these):
 *   {
 *     from:        "alice@example.com"  | "Alice <alice@example.com>",
 *     to:          "info@pennylime.com",
 *     subject:     "Re: Application",
 *     text?:       "plain text body",
 *     html?:       "<p>html body</p>",
 *     messageId?:  "<abc@mail.gmail.com>",
 *     inReplyTo?:  "<xyz@resend.com>",     // message-id this is replying to
 *     references?: "<msg1> <msg2>",
 *     receivedAt?: "2026-05-17T12:34:56Z",
 *   }
 *
 * On match-to-Contact:
 *   - EmailEvent row created (type="received") so the analytics dashboard
 *     and the CRM Email tab history both see it.
 *   - Activity row created on the contact timeline (type="email_received")
 *     so it shows up alongside notes, stage changes, etc.
 *   - Notification center fires the "newReply" event (best-effort).
 *
 * If no Contact matches the from address, the event still gets logged
 * as a "Contact-less" InboundEmail row so it isn't silently lost —
 * an admin can see it in /admin/audit and decide what to do.
 */
export async function POST(req: NextRequest) {
  // Shared-secret auth so randos can't fake-inject emails.
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return Response.json({ error: "INBOUND_EMAIL_SECRET not configured" }, { status: 500 });
  }
  const header = req.headers.get("x-inbound-secret");
  if (header !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string;
    receivedAt?: string;
    attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>;
  };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromEmail = extractEmail(payload.from ?? "");
  const subject = (payload.subject ?? "").slice(0, 998);
  const bodyText = (payload.text ?? stripHtml(payload.html ?? "")).slice(0, 50_000);

  if (!fromEmail) {
    return Response.json({ error: "Missing or unparseable 'from' address" }, { status: 400 });
  }

  // Match contact by from email (case-insensitive).
  const contact = await prisma.contact.findUnique({
    where: { email: fromEmail },
    select: { id: true, firstName: true, lastName: true, email: true, applicationId: true },
  });

  if (!contact) {
    // Log it to audit so it isn't silently dropped — admin can decide.
    await prisma.auditLog.create({
      data: {
        action: "INBOUND_EMAIL_UNMATCHED",
        entityType: "EMAIL",
        entityId: payload.messageId ?? "unknown",
        performedBy: fromEmail,
        details: JSON.stringify({ from: fromEmail, subject, preview: bodyText.slice(0, 200) }),
      },
    });
    return Response.json({ ok: true, matched: false });
  }

  // Save attachments as Documents on the linked Application (if any).
  // PDFs and CSVs → BANK_STATEMENT_90D so they slot into the existing
  // panel + AI parser. Images → REPLY_ATTACHMENT (generic) so admin
  // can recategorize if it's actually an ID photo or pay stub.
  const savedAttachments: Array<{ fileName: string; documentType: string }> = [];
  const droppedAttachments: Array<{ filename?: string; reason: string }> = [];
  if (payload.attachments && payload.attachments.length > 0 && contact.applicationId) {
    const attachments = payload.attachments.slice(0, MAX_ATTACHMENTS);
    for (const att of attachments) {
      if (!att.filename || !att.contentBase64) {
        droppedAttachments.push({
          filename: att.filename,
          reason: !att.filename ? "missing filename" : "missing contentBase64",
        });
        continue;
      }
      try {
        const buffer = Buffer.from(att.contentBase64, "base64");
        if (buffer.length === 0) {
          droppedAttachments.push({ filename: att.filename, reason: "empty buffer after decode" });
          continue;
        }
        if (buffer.length > MAX_ATTACHMENT_BYTES) {
          droppedAttachments.push({ filename: att.filename, reason: `oversize (${buffer.length} > ${MAX_ATTACHMENT_BYTES})` });
          continue;
        }
        const mime = att.mimeType || "application/octet-stream";
        const isStatementType =
          mime === "application/pdf" ||
          mime === "text/csv" ||
          mime === "application/csv" ||
          mime === "application/vnd.ms-excel";
        const documentType = isStatementType ? "BANK_STATEMENT_90D" : "REPLY_ATTACHMENT";
        const storagePath = await storage.upload(buffer, att.filename);
        await prisma.document.create({
          data: {
            applicationId: contact.applicationId,
            fileName: att.filename,
            mimeType: mime,
            fileSize: buffer.length,
            storagePath,
            documentType,
          },
        });
        savedAttachments.push({ fileName: att.filename, documentType });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to save inbound attachment:", att.filename, err);
        droppedAttachments.push({ filename: att.filename, reason: `save error: ${msg.slice(0, 200)}` });
      }
    }
  }

  // Diagnostic flag: if the body suggests an attachment ("attached",
  // "here you go", "see attached", "PDF") but we received zero, surface
  // it in the Activity title with a ⚠ so admin sees it at a glance.
  // Also log the raw payload metadata to audit for debugging the
  // upstream forwarder (Gmail Apps Script, Cloudflare, etc.).
  const bodyLooksLikeItHasAttachment =
    /\b(attached|attachment|here you go|here's|here is|please find|pdf|csv|statement)\b/i.test(
      bodyText,
    );
  const noAttachmentsReceived =
    !payload.attachments || payload.attachments.length === 0;
  const attachmentMismatch = bodyLooksLikeItHasAttachment && noAttachmentsReceived;

  if (attachmentMismatch || droppedAttachments.length > 0) {
    await prisma.auditLog.create({
      data: {
        action: "INBOUND_EMAIL_ATTACHMENT_ISSUE",
        entityType: "EMAIL",
        entityId: payload.messageId ?? `${contact.id}-${Date.now()}`,
        performedBy: fromEmail,
        details: JSON.stringify({
          contactId: contact.id,
          applicationId: contact.applicationId,
          subject,
          payloadAttachmentCount: payload.attachments?.length ?? 0,
          payloadAttachmentSummary:
            payload.attachments?.map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              base64Length: a.contentBase64?.length ?? 0,
            })) ?? [],
          dropped: droppedAttachments,
          attachmentMismatch,
          bodyPreview: bodyText.slice(0, 300),
        }),
      },
    }).catch((err) => console.error("[inbound] audit log failed:", err));
  }

  // Persist as both EmailEvent (analytics) and Activity (timeline).
  await prisma.emailEvent.create({
    data: {
      contactId: contact.id,
      type: "received",
      subject,
      messageId: payload.messageId ?? null,
    },
  });

  const attachSummary =
    savedAttachments.length > 0
      ? ` (${savedAttachments.length} attachment${savedAttachments.length > 1 ? "s" : ""}: ${savedAttachments.map((a) => a.fileName).join(", ")})`
      : attachmentMismatch
      ? ` ⚠ ATTACHMENT EXPECTED BUT NOT RECEIVED`
      : "";

  await prisma.activity.create({
    data: {
      contactId: contact.id,
      type: "email_received",
      title: `Email: ${subject || "(no subject)"}${attachSummary}`,
      details: bodyText.slice(0, 2000),
      performedBy: fromEmail,
    },
  });

  // Best-effort admin notification — never blocks ingest.
  try {
    const { notifyAdmins, getAdminUrl } = await import("@/lib/notify");
    const url = `${getAdminUrl()}/admin/contacts/${contact.id}`;
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
    notifyAdmins("inboundEmail", {
      subject: `Reply from ${fullName} — ${subject || "(no subject)"}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> just replied.</p>
<p><strong>Subject:</strong> ${escapeHtml(subject || "(no subject)")}</p>
<blockquote style="border-left: 3px solid #15803d; padding: 8px 12px; margin: 12px 0; background: #f0fdf4; color: #1f2937;">
  ${escapeHtml(bodyText.slice(0, 800)).replace(/\n/g, "<br>")}${bodyText.length > 800 ? "<br>…" : ""}
</blockquote>
<p><a href="${url}">Open in CRM</a></p>`,
    }).catch(() => {});
  } catch {
    // notify failures already swallowed in notifyAdmins, defensive
  }

  return Response.json({
    ok: true,
    matched: true,
    contactId: contact.id,
    attachmentsSaved: savedAttachments.length,
  });
}

/**
 * Extract the bare email from a "Name <addr@example.com>" header
 * value, or return a plain email as-is. Returns null if no valid
 * email is found. Always lowercased.
 */
function extractEmail(raw: string): string | null {
  if (!raw) return null;
  const angleMatch = raw.match(/<([^>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

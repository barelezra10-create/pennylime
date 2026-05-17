import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

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
    select: { id: true, firstName: true, lastName: true, email: true },
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

  // Persist as both EmailEvent (analytics) and Activity (timeline).
  await prisma.emailEvent.create({
    data: {
      contactId: contact.id,
      type: "received",
      subject,
      messageId: payload.messageId ?? null,
    },
  });

  await prisma.activity.create({
    data: {
      contactId: contact.id,
      type: "email_received",
      title: `Email: ${subject || "(no subject)"}`,
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

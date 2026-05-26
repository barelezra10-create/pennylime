"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/emails/send";
import { revalidatePath } from "next/cache";

/**
 * Pre-baked email templates available from the CRM Email tab. Each has
 * editable subject + body; admin can tweak before sending. Variables are
 * substituted at send time from the contact + linked application:
 *   {{firstName}}, {{lastName}}, {{email}}, {{phone}}, {{applicationCode}},
 *   {{loanAmount}}.
 */
export type CrmEmailTemplate = {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
};

export async function getCrmEmailTemplates(): Promise<CrmEmailTemplate[]> {
  return [
    {
      id: "request-bank-statements",
      name: "Request bank statements (90 days)",
      description: "Used when Plaid Transactions isn't available — ask for PDF/CSV manually.",
      subject: "Next step on your PennyLime application — last 90 days of transactions",
      body: `<p>Hi {{firstName}},</p>
<p>Thanks for applying for a cash advance with <strong>PennyLime</strong>. We're reviewing your application now.</p>
<p>To complete underwriting, we need to verify your recent deposits. Could you send us the <strong>last 90 days of transactions</strong> from the bank account where you receive your gig-platform deposits?</p>
<p>Two easy options — whichever is simpler:</p>
<ol>
  <li><strong>PDF statements</strong> — log in to your bank's online portal and download the last 3 monthly statements as PDFs.</li>
  <li><strong>CSV export</strong> — most banks let you export transactions to CSV from the activity / history page. Download the last 90 days.</li>
</ol>
<p>Just reply to this email with the files attached. Your statements are encrypted in transit and stored only as long as needed to fund and service your advance.</p>
<p>Once we have those, we'll review and get back to you within 24 hours.</p>
<p>Thanks,<br>The PennyLime Team</p>`,
    },
    {
      id: "request-id",
      name: "Request photo ID",
      description: "Asks for a clear photo of government-issued ID.",
      subject: "Quick verification needed — photo ID",
      body: `<p>Hi {{firstName}},</p>
<p>One more thing before we can finalize your PennyLime application (#{{applicationCode}}): we need a clear photo of a government-issued ID.</p>
<p>Accepted: driver's license, state ID, or passport. Both sides if it has them.</p>
<p>Just reply to this email with the photo attached. We'll review within a few hours.</p>
<p>Thanks,<br>The PennyLime Team</p>`,
    },
    {
      id: "follow-up-generic",
      name: "Follow up — generic",
      description: "Light touch — just checking in.",
      subject: "Checking in on your PennyLime application",
      body: `<p>Hi {{firstName}},</p>
<p>Just wanted to check in on your PennyLime application. Is there anything we can help with, or any questions about the next steps?</p>
<p>Reply to this email any time — we usually respond within a few hours during business days.</p>
<p>Thanks,<br>The PennyLime Team</p>`,
    },
    {
      id: "more-info",
      name: "Need more info",
      description: "Free-form — edit the body to ask for whatever you need.",
      subject: "A couple more details we need from you",
      body: `<p>Hi {{firstName}},</p>
<p>We're nearly done reviewing your PennyLime application (#{{applicationCode}}). To wrap things up, could you send us:</p>
<ul>
  <li>[edit this list before sending]</li>
</ul>
<p>Just reply to this email — usually quickest. Thanks!</p>
<p>— The PennyLime Team</p>`,
    },
    {
      id: "more-info-bank-transactions",
      name: "We need more info — 90 days of bank transactions",
      description: "Continue-the-review framing asking for 90-day bank transactions.",
      subject: "We need a bit more info to continue your application",
      body: `<p>Hi {{firstName}},</p>
<p>Thanks again for applying to <strong>PennyLime</strong>. We've started reviewing your application (#{{applicationCode}}) and need a little more information before we can move forward.</p>
<p>Could you send us the <strong>last 90 days of transactions</strong> from the bank account where you receive your gig-platform deposits? This helps us verify your deposit history so we can finalize underwriting.</p>
<p>Two easy options — whichever is simpler for you:</p>
<ol>
  <li><strong>PDF statements</strong> — log in to your bank's online portal and download the last 3 monthly statements as PDFs.</li>
  <li><strong>CSV export</strong> — most banks let you export transactions to CSV from the activity/history page. Download the last 90 days.</li>
</ol>
<p>Just reply to this email with the files attached. Your statements are encrypted in transit and stored only as long as needed to fund and service your advance.</p>
<p>Once we have them, we'll wrap up the review and get back to you with terms within 24 hours.</p>
<p>Thanks,<br>The PennyLime Team</p>`,
    },
    {
      id: "approved-coming-soon",
      name: "Approved — offer coming",
      description: "Sets expectation that the offer link is on its way.",
      subject: "Good news — your PennyLime application is approved",
      body: `<p>Hi {{firstName}},</p>
<p>Great news — your application (#{{applicationCode}}) is approved. We'll send your offer with the available advance amount, term options, and weekly remittance within the next few hours.</p>
<p>Once you accept, funds typically land in your bank account within 1-3 business days.</p>
<p>Talk soon,<br>The PennyLime Team</p>`,
    },
  ];
}

function interpolate(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/**
 * Sends a custom email from the CRM to the contact. Records both an
 * Activity row (for the contact timeline) and an EmailEvent row (so the
 * email analytics dashboard counts it). Subject + body can be free-form
 * or come from a template; both are interpolated against the contact +
 * application before send.
 */
export async function sendCrmEmail(input: {
  contactId: string;
  subject: string;
  body: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      application: { select: { applicationCode: true, loanAmount: true } },
    },
  });
  if (!contact?.email) return { ok: false as const, error: "Contact has no email" };

  const vars = {
    firstName: contact.firstName,
    lastName: contact.lastName ?? "",
    email: contact.email,
    phone: contact.phone ?? "",
    applicationCode: contact.application?.applicationCode ?? "",
    loanAmount: contact.application?.loanAmount
      ? String(Number(contact.application.loanAmount))
      : "",
  };
  const subject = interpolate(input.subject, vars);
  const body = interpolate(input.body, vars);

  const result = await sendEmail({ to: contact.email, subject, html: body });
  if (!result.success) {
    return { ok: false as const, error: "Email send failed" };
  }

  await prisma.emailEvent.create({
    data: {
      contactId: contact.id,
      type: "sent",
      subject,
      messageId: result.id ?? null,
    },
  });

  await prisma.activity.create({
    data: {
      contactId: contact.id,
      type: "email_sent",
      title: `Email sent: ${subject}`,
      details: body.replace(/<[^>]+>/g, "").slice(0, 200),
      performedBy: session.user.email,
    },
  });

  revalidatePath(`/admin/contacts/${contact.id}`);
  return { ok: true as const };
}

/**
 * Most recent emails sent OR received for this contact, mixed chronologically.
 * Used by the CRM Email tab sidebar so admin sees the full conversation.
 */
export async function getRecentEmailsForContact(contactId: string) {
  return prisma.emailEvent.findMany({
    where: { contactId, type: { in: ["sent", "received"] } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, subject: true, type: true, createdAt: true, campaignId: true, sequenceId: true },
  });
}

/**
 * Full email conversation thread for a contact — both inbound and
 * outbound, with the actual body text so Bar can read what was said
 * without leaving the CRM.
 *
 * Sources:
 *   - Inbound bodies come from Activity (type=email_received) which
 *     the inbound-email webhook populates with body text in `details`.
 *   - Outbound bodies come from Activity (type=email_sent) which
 *     sendCrmEmail populates with the body stripped of HTML.
 *
 * Returns newest-first so the latest message is at the top of the UI.
 */
export async function getEmailThread(contactId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  // Mark any UNREAD inbound emails for this contact as READ. Opening the
  // contact's Email tab is equivalent to opening them in /admin/inbox -
  // either path clears the CRM badge.
  await prisma.inboundEmail.updateMany({
    where: { contactId, status: "UNREAD" },
    data: { status: "READ" },
  }).catch(() => null);

  const activities = await prisma.activity.findMany({
    where: {
      contactId,
      type: { in: ["email_received", "email_sent"] },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      title: true,
      details: true,
      performedBy: true,
      createdAt: true,
    },
  });

  return activities.map((a) => ({
    id: a.id,
    direction: a.type === "email_received" ? ("inbound" as const) : ("outbound" as const),
    // Title comes in as "Email: Re: …" or "Email sent: Subject" —
    // strip the prefix so the UI shows just the subject.
    subject: a.title
      ?.replace(/^Email(?:\s+sent)?:\s*/i, "")
      // Some inbound messages tack on " (1 attachment: foo.pdf)"; keep that.
      .trim() ?? "(no subject)",
    body: a.details ?? "",
    performedBy: a.performedBy,
    createdAt: a.createdAt.toISOString(),
  }));
}

/**
 * Takes a rough admin draft + the customer's most recent inbound
 * message, asks Gemini to rewrite into a polished HTML reply +
 * suggested subject. Bar's use case: type "yes approved 1500, send
 * link" → get back "Hi Pedro, thanks for the message. Good news,
 * we've approved you for $1,500. Here's the link to accept…"
 */
export async function polishReplyWithAI(input: {
  contactId: string;
  draftNotes: string;
}): Promise<
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  if (!input.draftNotes.trim()) {
    return { ok: false as const, error: "Write a few words first, then I can polish them." };
  }

  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      applicationId: true,
      application: {
        select: {
          applicationCode: true,
          acceptedAmount: true,
          offeredMaxAmount: true,
          status: true,
          offerStatus: true,
          loanAmount: true,
        },
      },
    },
  });
  if (!contact) return { ok: false as const, error: "Contact not found" };

  // Most recent inbound activity gives the AI real grounding so it
  // doesn't invent context. Without this it'll write a generic reply.
  const lastInbound = await prisma.activity.findFirst({
    where: { contactId: input.contactId, type: "email_received" },
    orderBy: { createdAt: "desc" },
    select: { title: true, details: true, createdAt: true },
  });

  const fmtMoney = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString()}`;

  const contextSummary = [
    `Contact: ${contact.firstName ?? ""} ${contact.lastName ?? ""} <${contact.email}>`,
    contact.application ? `Application code: ${contact.application.applicationCode}` : null,
    contact.application
      ? `Application status: ${contact.application.status} / offer ${contact.application.offerStatus}`
      : null,
    contact.application?.loanAmount
      ? `Requested: ${fmtMoney(Number(contact.application.loanAmount))}`
      : null,
    contact.application?.offeredMaxAmount
      ? `Offered max: ${fmtMoney(Number(contact.application.offeredMaxAmount))}`
      : null,
    contact.application?.acceptedAmount
      ? `Accepted: ${fmtMoney(Number(contact.application.acceptedAmount))}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lastInboundText = lastInbound
    ? `Subject: ${lastInbound.title?.replace(/^Email: /, "") ?? "(no subject)"}\nReceived: ${lastInbound.createdAt.toISOString()}\n\n${lastInbound.details ?? "(no body captured)"}`
    : "(no inbound email on file yet — admin may be initiating contact)";

  const SYSTEM_PROMPT = `You are a customer support specialist for PennyLime, a cash-advance product for US gig workers (Uber, DoorDash, Lyft, OnlyFans, etc.).

The admin will give you:
1. The contact's profile + application context
2. The customer's most recent inbound message
3. The admin's rough draft notes for the reply (could be very short — "yes approved 1500", "tell him to upload statements", "schedule for tomorrow")

Your job: rewrite the rough draft into a polished, professional, friendly HTML email reply.

VOICE
- Warm but direct. No corporate jargon. No "Dear Sir/Madam".
- Address the customer by first name in the first line if known.
- Sign off as "The PennyLime Team".
- NEVER use em dashes. Use commas, parentheses, or sentence breaks instead.

FORMAT
- HTML body only. Use <p> for paragraphs, <ul>/<li> for lists, <strong> for emphasis when warranted.
- 3-5 short paragraphs max. Concise.
- No <html>, <head>, <body> wrappers.
- No subject line inside the body.

OUTPUT
Return STRICT JSON, no code fences:
{
  "subject": "...",
  "body": "<p>Hi {firstName},</p>..."
}
Subject: short and specific (not "Re: Your application"). Describes what the email is actually about.`;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "GEMINI_API_KEY not configured" };
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_REPLY_MODEL || "gemini-2.5-flash-lite";

    const userMessage = `CONTEXT
${contextSummary}

CUSTOMER'S LAST INBOUND MESSAGE
${lastInboundText}

ADMIN'S ROUGH DRAFT
${input.draftNotes.trim()}

Now write the polished reply.`;

    const r = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT }, { text: userMessage }],
        },
      ],
      config: { temperature: 0.7, responseMimeType: "application/json" },
    });
    let raw = (r.text ?? "").trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(raw) as { subject?: string; body?: string };
    if (!parsed.subject || !parsed.body) {
      return { ok: false as const, error: "Gemini returned an empty subject or body" };
    }
    return { ok: true as const, subject: parsed.subject, body: parsed.body };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Polish failed" };
  }
}

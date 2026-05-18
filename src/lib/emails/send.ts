import { getResend, FROM_EMAIL } from "@/lib/email";
import { wrapTransactionalEmail } from "@/lib/emails/branded-wrapper";
import { prisma } from "@/lib/db";

// Where customer replies land. Outbound goes from notifications@…
// (transactional sender) but humans should reply to info@… which is
// monitored by the team.
const REPLY_TO = process.env.RESEND_REPLY_TO || "info@pennylime.com";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  preheader?: string;
  // Optional CRM linkage — when provided we record an EmailEvent +
  // Activity so the email shows up on the contact's timeline.
  contactId?: string;
  // Internal identifier of the transactional template that was sent
  // (e.g. "offer-ready", "advance-funded"). Logged on the Activity
  // for filtering and reporting.
  templateId?: string;
}) {
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: params.to,
      replyTo: REPLY_TO,
      subject: params.subject,
      html: wrapTransactionalEmail(params.html, params.preheader),
    });
    const messageId = result.data?.id ?? null;

    // CRM logging — best-effort, never blocks the send. If something
    // goes wrong we log the error but still return success since the
    // email did go out.
    if (params.contactId) {
      try {
        await prisma.emailEvent.create({
          data: {
            contactId: params.contactId,
            type: "sent",
            subject: params.subject,
            messageId,
          },
        });
        await prisma.activity.create({
          data: {
            contactId: params.contactId,
            type: "email_sent",
            title: `Email sent: ${params.subject}`,
            details: params.templateId
              ? `Template: ${params.templateId}`
              : undefined,
            performedBy: "system",
          },
        });
      } catch (logErr) {
        console.error("[email] CRM log failed (send succeeded):", logErr);
      }
    }

    return { success: true, id: messageId };
  } catch (error) {
    console.error("Email send error:", error);
    // Best-effort CRM log of the failure so admin can see *some*
    // record on the contact's timeline if a customer reports nothing.
    if (params.contactId) {
      try {
        await prisma.activity.create({
          data: {
            contactId: params.contactId,
            type: "email_failed",
            title: `Email failed: ${params.subject}`,
            details:
              error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
            performedBy: "system",
          },
        });
      } catch {
        // swallow — already logged the original error
      }
    }
    return { success: false, error };
  }
}

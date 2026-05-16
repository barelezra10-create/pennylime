import { getResend, FROM_EMAIL } from "@/lib/email";
import { wrapTransactionalEmail } from "@/lib/emails/branded-wrapper";

// Where customer replies land. Outbound goes from notifications@…
// (transactional sender) but humans should reply to info@… which is
// monitored by the team.
const REPLY_TO = process.env.RESEND_REPLY_TO || "info@pennylime.com";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  preheader?: string;
}) {
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: params.to,
      replyTo: REPLY_TO,
      subject: params.subject,
      html: wrapTransactionalEmail(params.html, params.preheader),
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

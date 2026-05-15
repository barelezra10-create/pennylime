import { getResend, FROM_EMAIL } from "@/lib/email";
import { wrapTransactionalEmail } from "@/lib/emails/branded-wrapper";

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
      subject: params.subject,
      html: wrapTransactionalEmail(params.html, params.preheader),
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

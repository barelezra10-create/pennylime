import { getResend, FROM_EMAIL } from "@/lib/email";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

import { APP_URL } from "@/lib/email";

export function bankUpdateRequestEmail(params: {
  firstName: string;
  token: string;
}) {
  const url = `${APP_URL}/update-bank/${params.token}`;
  return {
    subject: "Update the bank account on your PennyLime advance",
    preheader: "Securely connect your bank so your payments come from the right account.",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Update your bank account</h2>
        <p>Hi ${params.firstName},</p>
        <p>You asked to change the bank account we use for your PennyLime advance payments. To keep this secure, please connect your bank directly. It takes about a minute and your payments will move to the new account automatically.</p>
        <p style="margin: 28px 0;">
          <a href="${url}" style="background:#15803d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">Connect your bank</a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Or paste this link into your browser:<br /><a href="${url}" style="color:#15803d;">${url}</a></p>
        <p style="color:#6b7280;font-size:13px;">This link expires in 7 days. If you did not request this, you can ignore this email and your current bank account stays unchanged.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

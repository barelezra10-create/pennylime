import { APP_URL } from "@/lib/email";

export function collectionEscalationEmail(params: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "FINAL NOTICE: Your Account Has Been Sent to Collections",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Account Sent to Collections</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan account has been escalated to collections due to non-payment for over 30 days. The total outstanding amount is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        <p>Automatic payment retries have been suspended. A representative will be in contact regarding your account.</p>
        <p>To resolve this matter, please contact us immediately.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

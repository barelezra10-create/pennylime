import { APP_URL } from "@/lib/email";

export function collectionEscalationEmail(params: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "FINAL NOTICE: your advance has moved to collections",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Your advance has moved to collections</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your PennyLime advance has been escalated to collections after 30+ days of missed remittances. The outstanding balance is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        <p>We've paused automatic remittance retries. A representative from our recovery team will be reaching out about next steps.</p>
        <p>If you want to get ahead of this and resolve the balance now, contact our support team today.</p>
        <p>View your advance: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime. Collection activity is conducted in compliance with applicable commercial finance and FDCPA-equivalent standards.</p>
      </div>
    `,
  };
}

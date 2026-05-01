import { APP_URL } from "@/lib/email";

export function paymentFailedEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "Remittance failed, you may need to act",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Remittance failed</h2>
        <p>Hi ${params.firstName},</p>
        <p>We couldn't pull remittance #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong> from your linked bank account.</p>
        <p>We'll auto-retry on the next cycle. To keep things smooth, double-check that the account has enough on hand.</p>
        <p>If your bank connection needs a refresh, reach out to support and we'll sort it.</p>
        <p>View your advance: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

import { APP_URL } from "@/lib/email";

export function paymentSuccessEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  remainingBalance: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Got it: $${params.amount.toFixed(2)} remittance received`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Remittance received</h2>
        <p>Hi ${params.firstName},</p>
        <p>Got remittance #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong>. Thanks for keeping things on track.</p>
        <p>Remaining advance balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        ${params.remainingBalance <= 0 ? '<p style="color: #15803d; font-weight: bold;">Paid in full. Your advance is closed out, nice work.</p>' : ""}
        <p>View your advance: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

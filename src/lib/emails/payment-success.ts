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
    subject: `Payment Received: $${params.amount.toFixed(2)}, Thank You`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Payment Received</h2>
        <p>Hi ${params.firstName},</p>
        <p>We've received your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong>. Thank you!</p>
        <p>Remaining balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        ${params.remainingBalance <= 0 ? '<p style="color: #16a34a; font-weight: bold;">Congratulations! Your loan is fully paid off!</p>' : ""}
        <p>View your loan: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

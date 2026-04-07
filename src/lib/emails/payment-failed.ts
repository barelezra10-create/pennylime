import { APP_URL } from "@/lib/email";

export function paymentFailedEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "Payment Failed, Action May Be Required",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Payment Failed</h2>
        <p>Hi ${params.firstName},</p>
        <p>We were unable to process your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong>.</p>
        <p>We will automatically retry the payment. Please ensure your bank account has sufficient funds.</p>
        <p>If your bank connection needs to be updated, please contact us.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

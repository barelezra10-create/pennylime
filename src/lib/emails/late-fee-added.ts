import { APP_URL } from "@/lib/email";

export function lateFeeAddedEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  lateFeeAmount: number;
  originalAmount: number;
  totalDue: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Late Fee Applied: $${params.lateFeeAmount.toFixed(2)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">Late Fee Applied</h2>
        <p>Hi ${params.firstName},</p>
        <p>A late fee of <strong>$${params.lateFeeAmount.toFixed(2)}</strong> has been applied to your overdue payment #${params.paymentNumber}.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Original Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.originalAmount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Late Fee</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #ea580c;">$${params.lateFeeAmount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Total Due</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.totalDue.toFixed(2)}</td></tr>
        </table>
        <p>Please ensure your bank account has sufficient funds. We will continue to attempt collection.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #ea580c;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

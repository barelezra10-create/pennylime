import { APP_URL } from "@/lib/email";

export function paymentReminderEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  dueDate: Date;
  remainingBalance: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Heads up: $${params.amount.toFixed(2)} remittance on ${params.dueDate.toLocaleDateString()}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Remittance reminder</h2>
        <p>Hi ${params.firstName},</p>
        <p>Quick heads up, remittance #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong> on your advance is scheduled for <strong>${params.dueDate.toLocaleDateString()}</strong>.</p>
        <p>It'll be auto-debited from your linked bank account, no action needed on your end.</p>
        <p>Remaining advance balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        <p>View your advance: <a href="${statusUrl}" style="color: #2563eb;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

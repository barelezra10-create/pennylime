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
    subject: `Payment Reminder: $${params.amount.toFixed(2)} due ${params.dueDate.toLocaleDateString()}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Payment Reminder</h2>
        <p>Hi ${params.firstName},</p>
        <p>This is a reminder that your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong> is due on <strong>${params.dueDate.toLocaleDateString()}</strong>.</p>
        <p>The payment will be automatically debited from your linked bank account.</p>
        <p>Remaining balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        <p>View your loan: <a href="${statusUrl}" style="color: #2563eb;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

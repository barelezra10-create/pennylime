import { APP_URL } from "@/lib/email";

export function collectionWarningEmail(params: {
  firstName: string;
  applicationCode: string;
  daysOverdue: number;
  totalOverdue: number;
  isSecondWarning: boolean;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const urgency = params.isSecondWarning ? "URGENT" : "IMPORTANT";
  return {
    subject: `${urgency}: Your Loan Payment is ${params.daysOverdue} Days Overdue`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${params.isSecondWarning ? "Second Warning" : "Formal Warning"}: Payment Overdue</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan payment is now <strong>${params.daysOverdue} days overdue</strong>. The total outstanding amount is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        ${params.isSecondWarning
          ? "<p><strong>This is your second warning.</strong> If payment is not received within 16 days, your account will be escalated to collections.</p>"
          : "<p>Please arrange payment as soon as possible to avoid additional late fees and potential escalation to collections.</p>"
        }
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

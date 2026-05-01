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
    subject: `${urgency}: your advance remittance is ${params.daysOverdue} days behind`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${params.isSecondWarning ? "Second Warning" : "Formal Warning"}: Remittance Overdue</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your PennyLime advance remittance is now <strong>${params.daysOverdue} days overdue</strong>. The outstanding balance is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        ${params.isSecondWarning
          ? "<p><strong>This is your second warning.</strong> If we don't receive payment within 16 days, your advance will be escalated to collections.</p>"
          : "<p>Please square this up as soon as possible to avoid further fees and a collections escalation.</p>"
        }
        <p>View your advance: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

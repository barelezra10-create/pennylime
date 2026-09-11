import { APP_URL } from "@/lib/email";

type Row = { paymentNumber: number; dueDate: Date; amount: number };

/**
 * Sent when a borrower's repayment schedule is rescheduled (e.g. the first
 * debit is moved out because the advance deposits later than planned). Shows
 * the new first-payment date, per-debit amount, remaining total, and the full
 * updated schedule so the borrower knows exactly when we'll debit.
 */
export function paymentTermsUpdatedEmail(params: {
  firstName: string;
  applicationCode: string;
  firstDueDate: Date;
  schedule: Row[]; // remaining (unpaid) payments in due-date order
  frequency?: "WEEKLY" | "DAILY";
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const isDaily = params.frequency === "DAILY";
  const numPayments = params.schedule.length;
  const remainingTotal = params.schedule.reduce((s, p) => s + p.amount, 0);
  const perDebit = params.schedule[0]?.amount ?? 0;
  const cadence = isDaily ? "every business day (Mon-Fri)" : "weekly";
  const firstDueLabel = params.firstDueDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const scheduleRows = params.schedule
    .map(
      (p) =>
        `<tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">#${p.paymentNumber}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">${p.dueDate.toLocaleDateString()}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">$${p.amount.toFixed(2)}</td>
        </tr>`,
    )
    .join("");

  return {
    subject: `Your PennyLime payment schedule has been updated`,
    preheader: `Your first payment is now ${params.firstDueDate.toLocaleDateString()}.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Your payment schedule has been updated</h2>
        <p>Hi ${params.firstName},</p>
        <p>We've adjusted your repayment schedule so your first payment lines up after your advance deposits. Your first payment is now scheduled for <strong>${firstDueLabel}</strong>, and payments continue ${cadence} from there.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">First Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.firstDueDate.toLocaleDateString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Payment Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${perDebit.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Payments Remaining</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${numPayments}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Remaining Total</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${remainingTotal.toFixed(2)}</td></tr>
        </table>
        <h3>Updated Payment Schedule</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 6px 12px; text-align: left;">#</th>
              <th style="padding: 6px 12px; text-align: left;">Due Date</th>
              <th style="padding: 6px 12px; text-align: left;">Amount</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
        <p>Each payment is auto-debited from your linked bank account on its scheduled date. Nothing will be debited before your first payment date above.</p>
        <p>View your advance anytime: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <p>Questions? Just reply to this email or reach us at info@pennylime.com.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime (770 Technology LLC). This is a cash advance product.</p>
      </div>
    `,
  };
}

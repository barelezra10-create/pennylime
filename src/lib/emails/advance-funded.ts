import { APP_URL } from "@/lib/email";
import type { ScheduleEntry } from "@/lib/amortization";

export function loanFundedEmail(params: {
  firstName: string;
  applicationCode: string;
  fundedAmount: number;
  interestRate: number;
  loanTermMonths: number;
  monthlyPayment: number;
  firstDueDate: Date;
  schedule: ScheduleEntry[];
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const factorRate = 1 + params.interestRate / 100;
  const totalRepayment = params.fundedAmount * factorRate;
  const weeks = Math.max(1, Math.round((params.loanTermMonths * 52) / 12));
  const weeklyRemittance = totalRepayment / weeks;
  const scheduleRows = params.schedule
    .map(
      (p) =>
        `<tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">#${p.paymentNumber}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">${p.dueDate.toLocaleDateString()}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">$${p.amount.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return {
    subject: `Funded. $${params.fundedAmount.toLocaleString()} is on the way.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Your advance is funded.</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your <strong>$${params.fundedAmount.toLocaleString()}</strong> advance is on its way to your linked bank account. Here are the terms and your remittance schedule.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Funded Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.fundedAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Factor Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${factorRate.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Total Repayment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${totalRepayment.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${weeks} weeks</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Weekly Remittance</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${weeklyRemittance.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">First Remittance Due</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.firstDueDate.toLocaleDateString()}</td></tr>
        </table>
        <h3>Remittance Schedule</h3>
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
        <p>Each remittance will be auto-debited from your linked bank account on its scheduled date as a purchase of future receivables.</p>
        <p>Track your advance: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime purchases a portion of your future receivables at the factor rate above. This is a commercial advance, not a loan.</p>
      </div>
    `,
  };
}

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
    subject: "Your Loan Has Been Funded, Payment Schedule Inside",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Your Loan Has Been Funded!</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan of <strong>$${params.fundedAmount.toLocaleString()}</strong> has been funded. Below are your loan details and payment schedule.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Funded Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.fundedAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Interest Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.interestRate}% APR</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.loanTermMonths} months</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Monthly Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.monthlyPayment.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">First Payment Due</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.firstDueDate.toLocaleDateString()}</td></tr>
        </table>
        <h3>Payment Schedule</h3>
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
        <p>Payments will be automatically debited from your linked bank account on each due date.</p>
        <p>Track your loan: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

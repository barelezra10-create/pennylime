import { APP_URL } from "@/lib/email";

export function applicationApprovedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
  interestRate: number;
  loanTermMonths: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const factorRate = 1 + params.interestRate / 100;
  const totalRepayment = params.loanAmount * factorRate;
  const weeks = Math.max(1, Math.round((params.loanTermMonths * 52) / 12));
  const weeklyRemittance = totalRepayment / weeks;

  return {
    subject: `Approved: $${params.loanAmount.toLocaleString()} advance ready to fund`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">You're approved.</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your merchant cash advance is approved and ready to move. Here are the terms:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Advance Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.loanAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Factor Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${factorRate.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Total Repayment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${totalRepayment.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${weeks} weeks</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Est. Weekly Remittance</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${weeklyRemittance.toFixed(2)}</td></tr>
        </table>
        <p>Next up: we'll wire the funds to your linked bank account. You'll get a confirmation the moment it's out the door.</p>
        <p>Track your advance: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime purchases a portion of your future receivables. This is a cash advance product.</p>
      </div>
    `,
  };
}

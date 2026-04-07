import { APP_URL } from "@/lib/email";

export function applicationApprovedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
  interestRate: number;
  loanTermMonths: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const monthlyRate = params.interestRate / 100 / 12;
  const months = params.loanTermMonths;
  const monthlyPayment =
    (params.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return {
    subject: "Congratulations! Your Loan is Approved, PennyLime",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Your Loan Has Been Approved!</h2>
        <p>Hi ${params.firstName},</p>
        <p>Great news, your loan application has been approved.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Loan Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.loanAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Interest Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.interestRate}% APR</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.loanTermMonths} months</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Est. Monthly Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${monthlyPayment.toFixed(2)}</td></tr>
        </table>
        <p>Next steps: We will wire the funds to your linked bank account. You'll receive a confirmation once the funds are sent.</p>
        <p>Track your loan at: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

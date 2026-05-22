import { APP_URL } from "@/lib/email";

export function applicationApprovedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
  // interestRate + loanTermMonths kept for backwards compatibility with
  // older callers; they're not displayed. The "offer ready" email - sent
  // immediately after this one - carries the actual plan terms because
  // those depend on which plan the borrower picks on the offer page.
  interestRate?: number;
  loanTermMonths?: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;

  return {
    subject: `Approved: $${params.loanAmount.toLocaleString()} advance ready to fund`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">You're approved.</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your PennyLime cash advance has been approved for up to <strong>$${params.loanAmount.toLocaleString()}</strong>.</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 0 0 4px; color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Approved amount</p>
          <p style="margin: 0; font-size: 32px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.02em;">$${params.loanAmount.toLocaleString()}</p>
          <p style="margin: 8px 0 0; font-size: 13px; color: #52525b;">Rate: <strong>5%</strong> per week, compounded</p>
        </div>
        <p>You'll receive a separate email with your <strong>offer plan options</strong> in a moment. Open that email to pick the weekly remittance plan that works for your cash flow and accept your advance.</p>
        <p>Once you accept, funds typically arrive in your linked bank account within 1 business day.</p>
        <p style="margin-top: 16px;">Track your application: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime purchases a portion of your future receivables. This is a cash advance product, not a loan.</p>
      </div>
    `,
  };
}

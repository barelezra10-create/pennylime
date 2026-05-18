import { APP_URL } from "@/lib/email";

export function offerReadyEmail(params: {
  firstName: string;
  applicationCode: string;
  offerToken: string;
  approvedAmount: number;
  weeklyRate: number;
  recommendedDurationWeeks: number;
  recommendedWeeklyRemittance: number;
  recommendedTotalRepaid: number;
}) {
  const offerUrl = `${APP_URL}/offer/${params.applicationCode}?t=${params.offerToken}`;
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    subject: `Your $${params.approvedAmount.toLocaleString()} advance is approved — review your offer`,
    html: `
      <h2 style="color: #15803d; margin: 0 0 8px;">You're approved, ${params.firstName}.</h2>
      <p style="font-size: 15px; color: #1a1a1a; margin: 0 0 20px;">
        Your PennyLime cash advance is ready to review. Open your offer page to pick the term that works for your cash flow and accept &mdash; funds typically arrive within 1 business day.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 0 0 20px;">
        <p style="margin: 0 0 4px; color: #15803d; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Approved up to</p>
        <p style="margin: 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.02em;">
          $${params.approvedAmount.toLocaleString()}
        </p>
        <p style="margin: 6px 0 0; font-size: 13px; color: #52525b;">
          at <strong>${params.weeklyRate}%</strong> per week, compounded
        </p>
      </div>

      <p style="font-size: 13px; color: #52525b; margin: 0 0 8px; font-weight: 600;">Our recommended plan</p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #52525b;">Weekly remittance</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #0a0a0a;">$${fmt(params.recommendedWeeklyRemittance)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #52525b;">Term</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #0a0a0a;">${params.recommendedDurationWeeks} weeks</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #52525b;">Total repaid</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0a0a0a;">$${fmt(params.recommendedTotalRepaid)}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #71717a; margin: 0 0 20px;">
        You can also pick a shorter or longer term on the offer page &mdash; whichever fits your weekly cash flow.
      </p>

      <p style="text-align: center; margin: 24px 0;">
        <a href="${offerUrl}"
           style="display: inline-block; background: #15803d; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px;">
          Review & accept your offer
        </a>
      </p>

      <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0 0 20px;">
        Or copy this link: <a href="${offerUrl}" style="color: #15803d;">${offerUrl}</a>
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        This offer is specific to your application. PennyLime purchases a portion of your future receivables &mdash; this is a cash advance product, not a loan. Reply to this email with any questions.
      </p>
    `,
  };
}

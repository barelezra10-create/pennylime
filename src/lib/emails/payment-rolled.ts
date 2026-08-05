import { APP_URL } from "@/lib/email";

/**
 * NSF roll notice: the borrower's payment returned, we moved it to the end of
 * the schedule, added a late fee, and want them funded for the next debit.
 */
export function paymentRolledEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  lateFeeAmount: number;
  nextDueDate: Date | null;
  nextAmount: number | null;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const nextLine =
    params.nextDueDate && params.nextAmount != null
      ? `<p>Your next payment of <strong>$${params.nextAmount.toFixed(2)}</strong> is scheduled for <strong>${params.nextDueDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong>. Please make sure your account is funded before then so it doesn't bounce again.</p>`
      : `<p>Please keep your linked account funded for your next scheduled payment.</p>`;
  return {
    subject: "Your payment didn't go through, here's what we did",
    // (see also fundsReadyReminderEmail below)
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #b45309;">Payment returned</h2>
        <p>Hi ${params.firstName},</p>
        <p>Payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong> was returned by your bank (usually insufficient funds).</p>
        <p>Here's what happened automatically:</p>
        <ul>
          <li>We moved that payment to the <strong>end of your plan</strong>, so you have time to recover.</li>
          <li>A <strong>$${params.lateFeeAmount.toFixed(2)} late fee</strong> was added as a separate charge.</li>
        </ul>
        ${nextLine}
        <p>View your full schedule: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

/**
 * Recovery nudge sent 2 days before the next payment for borrowers who
 * recently had an NSF, so they fund the account in time and don't bounce again.
 */
export function fundsReadyReminderEmail(params: {
  firstName: string;
  applicationCode: string;
  amount: number;
  dueDate: Date;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const when = params.dueDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return {
    subject: "Heads up: please have funds ready for your next payment",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Have funds ready</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your next payment of <strong>$${params.amount.toFixed(2)}</strong> is scheduled for <strong>${when}</strong>.</p>
        <p>Because a recent payment didn't clear, please make sure your linked account has enough on hand so this one goes through and you avoid another late fee.</p>
        <p>View your schedule: <a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

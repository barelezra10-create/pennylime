import { APP_URL } from "@/lib/email";

// Active-advance heads-up sent a few days before a scheduled debit so the
// borrower has time to fund the account. Softer than the day-before reminder.
export function upcomingPaymentEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  dueDate: Date | string;
  daysUntil: number;
  remainingBalance?: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const due = typeof params.dueDate === "string" ? new Date(params.dueDate) : params.dueDate;
  const dueLabel = due.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const whenLabel = params.daysUntil === 1 ? "tomorrow" : `in ${params.daysUntil} days`;

  return {
    subject: `Heads up: your $${params.amount.toFixed(2)} payment is coming up ${whenLabel}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
        <h2 style="color: #15803d; margin-bottom: 8px;">Hi ${params.firstName}, a payment is coming up</h2>
        <p style="font-size: 15px; line-height: 1.5;">
          This is a friendly heads-up that payment #${params.paymentNumber} of
          <strong>$${params.amount.toFixed(2)}</strong> is scheduled to debit
          <strong>${whenLabel}</strong> on <strong>${dueLabel}</strong>.
        </p>
        <p style="font-size: 15px; line-height: 1.5;">
          Please make sure your linked account is funded so it goes through smoothly.
          ${
            params.remainingBalance != null
              ? `Your remaining balance after this payment will be about <strong>$${params.remainingBalance.toFixed(2)}</strong>.`
              : ""
          }
        </p>
        <p style="font-size: 14px; color: #52525b;">
          Need to change the date? Just reply to this email and let us know.
          <br />
          View your advance + full schedule: <a href="${statusUrl}" style="color: #15803d; font-weight: 600;">${statusUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

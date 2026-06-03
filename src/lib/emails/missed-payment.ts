import { APP_URL } from "@/lib/email";

export function missedPaymentEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  dueDate: Date | string;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const due = typeof params.dueDate === "string" ? new Date(params.dueDate) : params.dueDate;
  const dueLabel = due.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return {
    subject: `Missed remittance #${params.paymentNumber}, let us know when to retry`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
        <h2 style="color: #dc2626; margin-bottom: 8px;">Hey ${params.firstName}, we missed a remittance</h2>
        <p style="font-size: 15px; line-height: 1.5;">
          Your remittance #${params.paymentNumber} of
          <strong>$${params.amount.toFixed(2)}</strong> was due on
          <strong>${dueLabel}</strong> and hasn't gone through yet.
        </p>

        <div style="margin: 24px 0; padding: 16px 18px; background: #f0fdf4; border-left: 4px solid #15803d; border-radius: 6px;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">No drama, just reply with a date.</p>
          <p style="margin: 0; font-size: 14px; color: #52525b; line-height: 1.5;">
            Reply to this email and tell us what day works for you to retry the debit.
            We'll line it up and pull from your linked account that morning. If you
            need a few extra days, that's fine, just say so.
          </p>
        </div>

        <p style="font-size: 14px; color: #52525b;">
          You can also check your advance + payment schedule any time:
          <br />
          <a href="${statusUrl}" style="color: #15803d; font-weight: 600;">${statusUrl}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
        <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
          PennyLime &middot; replies to this email come straight to our team.
        </p>
      </div>
    `,
  };
}

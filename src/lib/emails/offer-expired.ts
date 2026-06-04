import { APP_URL } from "@/lib/email";

export function offerExpiredEmail(params: {
  firstName: string;
  applicationCode: string;
  offerAmount: number;
}) {
  const reapplyUrl = `${APP_URL}/apply`;
  return {
    subject: "Your PennyLime offer expired, you can reapply any time",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
        <h2 style="color: #0a0a0a; margin-bottom: 8px;">Hey ${params.firstName},</h2>
        <p style="font-size: 15px; line-height: 1.5;">
          Your offer of up to <strong>$${params.offerAmount.toFixed(0)}</strong>
          expired because the agreement was not signed within 3 days.
        </p>
        <p style="font-size: 15px; line-height: 1.5;">
          No harm done. If you still need the funds, you can start a new
          application and we will requote based on your current numbers.
        </p>

        <div style="margin: 28px 0;">
          <a href="${reapplyUrl}"
             style="display: inline-block; background: #15803d; color: #fff;
                    padding: 12px 22px; border-radius: 10px;
                    text-decoration: none; font-weight: 600; font-size: 15px;">
            Start a new application
          </a>
        </div>

        <p style="font-size: 13px; color: #71717a; line-height: 1.5;">
          Reference: ${params.applicationCode}
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
        <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
          PennyLime &middot; replies come straight to our team.
        </p>
      </div>
    `,
  };
}

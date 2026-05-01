import { APP_URL } from "@/lib/email";

export function applicationSubmittedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;

  return {
    subject: `We've got your $${params.loanAmount.toLocaleString()} advance application`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Application received.</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your application for a <strong>$${params.loanAmount.toLocaleString()}</strong> merchant cash advance is in. Our underwriters are taking it from here.</p>
        <p>Your application code is: <strong style="font-size: 18px; letter-spacing: 2px;">${params.applicationCode}</strong></p>
        <p>You can check the status of your funding decision anytime:</p>
        <p><a href="${statusUrl}" style="color: #15803d;">${statusUrl}</a></p>
        <p>We move fast. Expect to hear back shortly.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

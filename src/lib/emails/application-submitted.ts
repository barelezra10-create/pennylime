import { APP_URL } from "@/lib/email";

export function applicationSubmittedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;

  return {
    subject: "Application Received, PennyLime",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Application Received!</h2>
        <p>Hi ${params.firstName},</p>
        <p>We've received your loan application for <strong>$${params.loanAmount.toLocaleString()}</strong>.</p>
        <p>Your application code is: <strong style="font-size: 18px; letter-spacing: 2px;">${params.applicationCode}</strong></p>
        <p>You can check your application status anytime at:</p>
        <p><a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <p>We'll review your application and get back to you soon.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

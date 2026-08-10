import { APP_URL } from "@/lib/email";

// Pre-legal FINAL notice. Sent once, after an advance has sat in collections
// for a while, BEFORE the account is defaulted and referred out. Firm and
// factual: it states what may happen next without threatening anything we
// would not actually do. Compliant with FDCPA-equivalent standards.
export function collectionFinalNoticeEmail(params: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
  respondByDays?: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const respondBy = params.respondByDays ?? 7;
  return {
    subject: "FINAL NOTICE before your account is referred for collection",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
        <h2 style="color: #b91c1c;">Final notice before referral</h2>
        <p>Hi ${params.firstName},</p>
        <p>
          Your PennyLime advance remains unpaid and is now in collections with an
          outstanding balance of <strong>$${params.totalOverdue.toFixed(2)}</strong>.
          We have contacted you several times without resolution.
        </p>
        <p>
          <strong>This is a final notice.</strong> If we do not hear from you within
          <strong>${respondBy} days</strong>, your account may be defaulted and
          referred to pursue available remedies, which can include reporting the
          default and referral to a third party for collection or legal action.
        </p>
        <p>
          You can still avoid this. We would much rather work out a payment
          arrangement than escalate. Reply to this email or contact our support
          team today and we will find a way forward.
        </p>
        <p>View your advance: <a href="${statusUrl}" style="color: #b91c1c;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          PennyLime. This is an attempt to collect a debt and any information
          obtained will be used for that purpose. Collection activity is conducted
          in compliance with applicable commercial finance and FDCPA-equivalent standards.
        </p>
      </div>
    `,
  };
}

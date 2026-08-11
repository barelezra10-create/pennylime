import { APP_URL } from "@/lib/email";

// Recurring collections reminder. Sent every few days while an account sits in
// collections, between the milestone notices, to keep pressure on until the
// balance is resolved. Firm and factual, offers a way to resolve.
export function collectionDunningEmail(params: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
  daysInCollections: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Your PennyLime balance of $${params.totalOverdue.toFixed(2)} is still unpaid`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
        <h2 style="color: #b91c1c;">Your account is still past due</h2>
        <p>Hi ${params.firstName},</p>
        <p>
          Your PennyLime advance has been in collections for ${params.daysInCollections} days
          with an outstanding balance of <strong>$${params.totalOverdue.toFixed(2)}</strong>.
          This balance is not going away, and the longer it stays open the closer it moves
          to default and referral for recovery.
        </p>
        <p>
          Please resolve it today. If you cannot pay the full amount right now, reply to this
          email or contact us and we will set up a payment arrangement that works. We would
          much rather work something out than escalate.
        </p>
        <p>Resolve your balance: <a href="${statusUrl}" style="color: #b91c1c;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          PennyLime. This is an attempt to collect a debt and any information obtained will be
          used for that purpose. Reply STOP to opt out of texts.
        </p>
      </div>
    `,
  };
}

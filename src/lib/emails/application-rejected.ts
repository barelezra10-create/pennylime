export function applicationRejectedEmail(params: {
  firstName: string;
  reason: string;
}) {
  return {
    subject: "Application Update, PennyLime",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Application Update</h2>
        <p>Hi ${params.firstName},</p>
        <p>Unfortunately, we're unable to approve your loan application at this time.</p>
        <p><strong>Reason:</strong> ${params.reason}</p>
        <p>You're welcome to reapply in the future if your circumstances change.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

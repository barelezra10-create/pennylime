export function applicationRejectedEmail(params: {
  firstName: string;
  reason: string;
}) {
  return {
    subject: "Funding decision: not this round",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Funding decision</h2>
        <p>Hi ${params.firstName},</p>
        <p>We took a close look at your application and we can't approve a PennyLime advance for your business right now.</p>
        <p><strong>Reason:</strong> ${params.reason}</p>
        <p>Things change fast in business. If your revenue, deposits, or processing volume look different in a few months, come back and reapply, we'd love another shot at funding you.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime</p>
      </div>
    `,
  };
}

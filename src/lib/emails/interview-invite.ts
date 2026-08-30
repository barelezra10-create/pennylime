export function interviewInviteEmail(params: {
  firstName: string;
  role: string;
  proposedTimes: string;
  note?: string;
}) {
  // Turn the admin-entered times (one per line, or comma separated) into a list.
  const slots = params.proposedTimes
    .split(/\r?\n|,(?=\s*\w)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const slotsHtml = slots.length
    ? `<ul style="margin:12px 0 0;padding-left:20px;">${slots.map((s) => `<li style="margin:4px 0;">${s}</li>`).join("")}</ul>`
    : `<p>${params.proposedTimes}</p>`;

  return {
    subject: `Interview for the ${params.role} role at PennyLime`,
    preheader: "We'd love to set up a quick call. Here are a few times that work.",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">Let's set up a quick interview</h2>
        <p>Hi ${params.firstName},</p>
        <p>Thanks for applying for the <strong>${params.role}</strong> role at PennyLime. We reviewed your background and would love to talk. Here are a few times that work on our end:</p>
        ${slotsHtml}
        ${params.note ? `<p style="margin-top:16px;">${params.note.replace(/\n/g, "<br/>")}</p>` : ""}
        <p style="margin-top:16px;">Just reply to this email and let me know which slot works best, or suggest another time if none of these fit. I'll send a calendar invite with the details.</p>
        <p>Looking forward to it.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime Hiring Team</p>
      </div>
    `,
  };
}

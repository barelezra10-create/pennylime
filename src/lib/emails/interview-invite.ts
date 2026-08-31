export function interviewInviteEmail(params: {
  firstName: string;
  role: string;
  whenText: string;
  meetLink: string;
  note?: string;
}) {
  return {
    subject: `Your Google Meet interview for the ${params.role} role at PennyLime`,
    preheader: `You're scheduled for ${params.whenText}. Join via Google Meet.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #15803d;">You're invited to a Google Meet interview</h2>
        <p>Hi ${params.firstName},</p>
        <p>Thanks for applying for the <strong>${params.role}</strong> role at PennyLime. We'd love to meet you over a <strong>Google Meet</strong> video call. Your interview is scheduled for:</p>
        <p style="font-size:16px;font-weight:700;color:#0a0a0a;margin:14px 0;">${params.whenText}</p>
        ${
          params.meetLink
            ? `<p style="margin:18px 0;"><a href="${params.meetLink}" style="background:#15803d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">Join Google Meet</a></p>
               <p style="color:#6b7280;font-size:13px;">Or open this link: <a href="${params.meetLink}" style="color:#15803d;">${params.meetLink}</a></p>`
            : ""
        }
        ${params.note ? `<p style="margin-top:16px;">${params.note.replace(/\n/g, "<br/>")}</p>` : ""}
        <p style="margin-top:16px;">You'll also receive a Google Calendar invitation for this time. If it doesn't work for you, just reply to this email and we'll find another slot.</p>
        <p>Looking forward to speaking with you.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime Hiring Team</p>
      </div>
    `,
  };
}

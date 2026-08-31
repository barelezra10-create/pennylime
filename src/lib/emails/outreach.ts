export function outreachEmail(params: { message: string }) {
  const body = params.message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return {
    subject: "Next steps on your PennyLime application",
    preheader: "We'd like to move forward. When are you available this week?",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color:#3f3f46;">
        ${body}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">PennyLime Hiring Team</p>
      </div>
    `,
  };
}

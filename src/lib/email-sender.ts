import { getResend } from "@/lib/email";
import { prisma } from "@/lib/db";

const FROM_EMAIL = process.env.FROM_EMAIL || "PennyLime <noreply@pennylime.com>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export async function sendMarketingEmail({
  to,
  subject,
  html,
  contactId,
  campaignId,
  sequenceId,
}: {
  to: string;
  subject: string;
  html: string;
  contactId: string;
  campaignId?: string;
  sequenceId?: string;
}): Promise<{ messageId: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { messageId: null, error: "Resend not configured" };

    // Wrap in branded template
    const wrappedHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <strong style="font-size:18px;color:#1a1a1a;">Credit</strong><strong style="font-size:18px;color:#15803d;">Lime</strong>
    </div>
    <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      ${html}
    </div>
    <div style="margin-top:24px;text-align:center;color:#a1a1aa;font-size:12px;">
      <p>PennyLime - Fast loans for gig workers</p>
      <p><a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#71717a;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: wrappedHtml,
    });

    const messageId = (result as { data?: { id?: string } })?.data?.id || null;

    // Log event
    await prisma.emailEvent.create({
      data: { contactId, campaignId, sequenceId, type: "sent", subject, messageId },
    });

    // Log activity
    await prisma.activity.create({
      data: { contactId, type: "email_sent", title: `Email sent: ${subject}`, performedBy: "system" },
    });

    return { messageId, error: null };
  } catch (err) {
    console.error("Email send error:", err);
    return { messageId: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

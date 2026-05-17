/**
 * Notification center. One entry point: notifyAdmins(eventType, ...).
 * Reads the NotificationConfig singleton, parses the recipient list for
 * the given event type, and fans out via the standard branded email
 * pipeline. Failures are logged but never throw — notifications should
 * never block the underlying user action (signup, application submit,
 * chat start, etc.).
 */

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/emails/send";

export type NotificationEvent =
  | "chatStarted"
  | "applicationSubmitted"
  | "leadCreated"
  | "inboundEmail";

const FIELD_BY_EVENT: Record<NotificationEvent, "chatStartedEmails" | "applicationSubmittedEmails" | "leadCreatedEmails" | "inboundEmailEmails"> = {
  chatStarted: "chatStartedEmails",
  applicationSubmitted: "applicationSubmittedEmails",
  leadCreated: "leadCreatedEmails",
  inboundEmail: "inboundEmailEmails",
};

function parseRecipients(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

export async function notifyAdmins(
  event: NotificationEvent,
  payload: { subject: string; html: string },
) {
  try {
    const config = await prisma.notificationConfig.findUnique({ where: { id: "singleton" } });
    const csv = config ? (config[FIELD_BY_EVENT[event]] as string) : "";
    const recipients = parseRecipients(csv);
    if (recipients.length === 0) return { ok: true, sent: 0 };

    let sent = 0;
    for (const to of recipients) {
      const r = await sendEmail({ to, subject: payload.subject, html: payload.html });
      if (r.success) sent++;
    }
    return { ok: true, sent };
  } catch (err) {
    console.error(`[notify] ${event} failed:`, err);
    return { ok: false, sent: 0, error: err instanceof Error ? err.message : "unknown" };
  }
}

export function getAdminUrl(): string {
  return process.env.APP_URL || "https://pennylime.com";
}

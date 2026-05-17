"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type NotificationConfigState = {
  chatStartedEmails: string;
  applicationSubmittedEmails: string;
  leadCreatedEmails: string;
};

export async function getNotificationConfig(): Promise<NotificationConfigState> {
  const config = await prisma.notificationConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  return {
    chatStartedEmails: config.chatStartedEmails,
    applicationSubmittedEmails: config.applicationSubmittedEmails,
    leadCreatedEmails: config.leadCreatedEmails,
  };
}

export async function saveNotificationConfig(input: NotificationConfigState) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  // Normalize each CSV field: lowercase, dedupe, drop invalid emails.
  const normalize = (csv: string) =>
    Array.from(
      new Set(
        csv
          .split(/[,\n]/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
      ),
    ).join(",");

  await prisma.notificationConfig.upsert({
    where: { id: "singleton" },
    update: {
      chatStartedEmails: normalize(input.chatStartedEmails),
      applicationSubmittedEmails: normalize(input.applicationSubmittedEmails),
      leadCreatedEmails: normalize(input.leadCreatedEmails),
    },
    create: {
      id: "singleton",
      chatStartedEmails: normalize(input.chatStartedEmails),
      applicationSubmittedEmails: normalize(input.applicationSubmittedEmails),
      leadCreatedEmails: normalize(input.leadCreatedEmails),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE_NOTIFICATION_CONFIG",
      entityType: "SETTINGS",
      entityId: "singleton",
      performedBy: session.user.email,
    },
  });

  revalidatePath("/admin/settings/notifications");
  return { ok: true as const };
}

/**
 * Sends a quick test email to every configured recipient for a given event,
 * so admin can verify recipients receive mail without waiting for a real
 * customer event.
 */
export async function sendTestNotification(event: "chatStarted" | "applicationSubmitted" | "leadCreated") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const { notifyAdmins } = await import("@/lib/notify");
  const labelByEvent = {
    chatStarted: "Chat started",
    applicationSubmitted: "Application submitted",
    leadCreated: "Lead created",
  };
  const r = await notifyAdmins(event, {
    subject: `[TEST] PennyLime — ${labelByEvent[event]}`,
    html: `<p>This is a test notification for the <strong>${labelByEvent[event]}</strong> event.</p>
<p>If you're reading this, your notification config is working.</p>
<p>Triggered by ${session.user.email} from the admin notifications page.</p>`,
  });
  return { ok: true as const, sent: r.sent };
}

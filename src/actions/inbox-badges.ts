"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type InboxBadges = {
  /** Chat sessions where the latest message is from the customer
   *  (awaiting an admin reply). Capped to recent activity to avoid
   *  counting stale dead conversations forever. */
  pendingChats: number;
  /** Number of customer contacts whose most recent email activity is
   *  an INBOUND email (i.e. we haven't replied yet). Decrements as
   *  soon as admin sends a reply through the CRM Email tab. */
  unrepliedEmails: number;
};

const PENDING_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;
// Look back 14 days for unreplied emails — older than that and the
// thread is functionally dead even if we never replied.
const UNREPLIED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Counts of items needing admin attention right now. Polled by the
 * top-nav every ~30s. Returns zeroed badges if the caller isn't
 * authenticated so unauthorized polling can't reveal customer activity.
 */
export async function getInboxBadges(): Promise<InboxBadges> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { pendingChats: 0, unrepliedEmails: 0 };
  }

  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);
  const emailCutoff = new Date(Date.now() - UNREPLIED_WINDOW_MS);

  const [recentChatSessions, latestEmailPerContact] = await Promise.all([
    prisma.agentSession.findMany({
      where: {
        channel: "chat",
        endedAt: null,
        startedAt: { gte: chatCutoff },
      },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, createdAt: true },
        },
      },
    }),
    // For each contact with recent email activity, get the latest event.
    // `distinct: ["contactId"]` paired with `orderBy: createdAt desc`
    // returns the most recent event per contact. Any contact whose
    // latest event is type="received" needs a reply.
    prisma.emailEvent.findMany({
      where: {
        createdAt: { gte: emailCutoff },
        type: { in: ["sent", "received"] },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["contactId"],
      select: { contactId: true, type: true },
    }),
  ]);

  const pendingChats = recentChatSessions.filter((s) => {
    const last = s.messages[0];
    if (!last) return false;
    if (last.role !== "user") return false;
    return last.createdAt >= chatCutoff;
  }).length;

  const unrepliedEmails = latestEmailPerContact.filter(
    (e) => e.type === "received",
  ).length;

  return { pendingChats, unrepliedEmails };
}

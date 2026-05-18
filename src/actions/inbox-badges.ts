"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type InboxBadges = {
  /** Chat sessions where the latest message is from the customer
   *  (awaiting an admin reply). Capped to recent activity to avoid
   *  counting stale dead conversations forever. */
  pendingChats: number;
  /** Inbound emails received in the last 24h. */
  recentInboundEmails: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Counts of items needing admin attention right now. Polled by the
 * top-nav every ~30s. Returns zeroed badges if the caller isn't
 * authenticated so unauthorized polling can't reveal customer activity.
 */
export async function getInboxBadges(): Promise<InboxBadges> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { pendingChats: 0, recentInboundEmails: 0 };
  }

  const dayAgo = new Date(Date.now() - DAY_MS);
  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);

  const [recentChatSessions, recentInboundEmails] = await Promise.all([
    prisma.agentSession.findMany({
      where: {
        channel: "chat",
        endedAt: null,
        // Either the session itself or its latest message has to be
        // within the window — we use startedAt as a coarse filter; the
        // per-session message lookup below confirms recency.
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
    prisma.emailEvent.count({
      where: { type: "received", createdAt: { gte: dayAgo } },
    }),
  ]);

  // A chat session is "pending" when its newest message is from the user
  // (role === "user") AND that message is within the activity window.
  const pendingChats = recentChatSessions.filter((s) => {
    const last = s.messages[0];
    if (!last) return false;
    if (last.role !== "user") return false;
    return last.createdAt >= chatCutoff;
  }).length;

  return { pendingChats, recentInboundEmails };
}

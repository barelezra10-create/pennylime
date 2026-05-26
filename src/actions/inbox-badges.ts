"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type UnrepliedSender = {
  contactId: string;
  name: string;
  email: string;
  latestSubject: string;
  preview: string;
  receivedAt: string; // ISO
};

export type InboxBadges = {
  pendingChats: number;
  unrepliedEmails: number;
  /** Up to 10 contacts whose latest email is inbound + we haven't replied.
   *  Includes name/email + subject + preview so the admin can tell at a
   *  glance WHO is waiting without clicking into each one. */
  unrepliedSenders: UnrepliedSender[];
};

/**
 * Lighter-weight server action used by list views (contacts table, pipeline)
 * that just need to mark rows that have unread inbound — no payload bodies
 * needed. Returns ALL pending contactIds (no 10-row cap), covering both
 * unreplied emails AND open chat sessions whose last message is from the user.
 */
export async function getUnreadContactIds(): Promise<{ contactIds: string[] }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { contactIds: [] };

  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);
  const emailCutoff = new Date(Date.now() - UNREPLIED_WINDOW_MS);

  const [latestEmailPerContact, openChatSessions] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { createdAt: { gte: emailCutoff }, type: { in: ["sent", "received"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["contactId"],
      select: { contactId: true, type: true },
    }),
    prisma.agentSession.findMany({
      where: { channel: "chat", endedAt: null, startedAt: { gte: chatCutoff } },
      select: {
        contactId: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true },
        },
      },
    }),
  ]);

  const ids = new Set<string>();
  for (const e of latestEmailPerContact) {
    if (e.type === "received") ids.add(e.contactId);
  }
  for (const s of openChatSessions) {
    if (s.contactId && s.messages[0]?.role === "user") ids.add(s.contactId);
  }

  return { contactIds: Array.from(ids) };
}

const PENDING_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;
const UNREPLIED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function getInboxBadges(): Promise<InboxBadges> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { pendingChats: 0, unrepliedEmails: 0, unrepliedSenders: [] };
  }

  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);
  const emailCutoff = new Date(Date.now() - UNREPLIED_WINDOW_MS);

  const [recentChatSessions, latestEmailPerContact] = await Promise.all([
    prisma.agentSession.findMany({
      where: { channel: "chat", endedAt: null, startedAt: { gte: chatCutoff } },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, createdAt: true },
        },
      },
    }),
    prisma.emailEvent.findMany({
      where: { createdAt: { gte: emailCutoff }, type: { in: ["sent", "received"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["contactId"],
      select: { contactId: true, type: true, createdAt: true },
    }),
  ]);

  const pendingChats = recentChatSessions.filter((s) => {
    const last = s.messages[0];
    if (!last) return false;
    if (last.role !== "user") return false;
    return last.createdAt >= chatCutoff;
  }).length;

  // Contacts whose latest email activity is inbound = unreplied.
  const unrepliedContactIds = latestEmailPerContact
    .filter((e) => e.type === "received")
    .map((e) => ({ contactId: e.contactId, receivedAt: e.createdAt }));

  // Pull full sender info + the actual inbound message details.
  let unrepliedSenders: UnrepliedSender[] = [];
  if (unrepliedContactIds.length > 0) {
    const ids = unrepliedContactIds.map((u) => u.contactId);
    // Fetch contacts + their most recent email_received activity in
    // two queries, then join client-side. Two queries is faster than
    // an N+1 per-contact lookup.
    const [contacts, latestInboundActivities] = await Promise.all([
      prisma.contact.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      prisma.activity.findMany({
        where: {
          contactId: { in: ids },
          type: "email_received",
        },
        orderBy: { createdAt: "desc" },
        distinct: ["contactId"],
        select: {
          contactId: true,
          title: true,
          details: true,
          createdAt: true,
        },
      }),
    ]);
    const contactById = new Map(contacts.map((c) => [c.id, c]));
    const activityById = new Map(
      latestInboundActivities.map((a) => [a.contactId, a]),
    );

    unrepliedSenders = unrepliedContactIds
      .map(({ contactId, receivedAt }) => {
        const c = contactById.get(contactId);
        const a = activityById.get(contactId);
        if (!c) return null;
        const name =
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
          c.email.split("@")[0];
        const subject = a?.title?.replace(/^Email(?:\s+sent)?:\s*/i, "").trim() ?? "(no subject)";
        const preview = (a?.details ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
        return {
          contactId,
          name,
          email: c.email,
          latestSubject: subject,
          preview,
          receivedAt: receivedAt.toISOString(),
        };
      })
      .filter((x): x is UnrepliedSender => x !== null)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, 10);
  }

  return {
    pendingChats,
    unrepliedEmails: unrepliedSenders.length,
    unrepliedSenders,
  };
}

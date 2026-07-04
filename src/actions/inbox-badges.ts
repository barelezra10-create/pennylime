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
  receivedAt: string;
};

export type InboxBadges = {
  pendingChats: number;
  unrepliedEmails: number;
  /** Up to 10 most recent inbound senders we haven't opened in /admin/inbox
   *  yet. Each row has name/email + subject + preview so the admin can tell
   *  at a glance WHO is waiting without clicking into each one.
   *  For unmatched (stranger) senders, contactId is `inbox:<inboundEmailId>`
   *  - the top-nav dropdown routes those to /admin/inbox?focus=<id>. */
  unrepliedSenders: UnrepliedSender[];
};

const PENDING_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Returns the contact IDs that should show an "unread" indicator on the
 * /admin/contacts list. Source of truth = InboundEmail.status === UNREAD
 * (for matched contacts) plus open chat sessions whose last message is
 * from the user. Reading the email in /admin/inbox or in the contact's
 * Email tab clears the dot.
 */
export async function getUnreadContactIds(): Promise<{ contactIds: string[] }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { contactIds: [] };

  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);

  const [unreadInbound, openChatSessions] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { status: "UNREAD", contactId: { not: null } },
      select: { contactId: true },
    }),
    prisma.agentSession.findMany({
      where: { channel: "chat", endedAt: null, archivedAt: null, startedAt: { gte: chatCutoff } },
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
  for (const e of unreadInbound) {
    if (e.contactId) ids.add(e.contactId);
  }
  for (const s of openChatSessions) {
    if (s.contactId && s.messages[0]?.role === "user") ids.add(s.contactId);
  }

  return { contactIds: Array.from(ids) };
}

/**
 * Powers the CRM nav-bar badge + dropdown. Counts UNREAD InboundEmail rows
 * (matched + unmatched) plus open chat sessions awaiting an admin reply.
 *
 * Reading an email in /admin/inbox flips its status from UNREAD -> READ,
 * which immediately drops the badge count by 1 on the next poll cycle.
 */
export async function getInboxBadges(): Promise<InboxBadges> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { pendingChats: 0, unrepliedEmails: 0, unrepliedSenders: [] };
  }

  const chatCutoff = new Date(Date.now() - PENDING_CHAT_WINDOW_MS);

  const [recentChatSessions, unreadInbound] = await Promise.all([
    prisma.agentSession.findMany({
      where: { channel: "chat", endedAt: null, archivedAt: null, startedAt: { gte: chatCutoff } },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, createdAt: true },
        },
      },
    }),
    prisma.inboundEmail.findMany({
      where: { status: "UNREAD" },
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: {
        id: true,
        contactId: true,
        fromEmail: true,
        fromName: true,
        subject: true,
        bodyText: true,
        receivedAt: true,
      },
    }),
  ]);

  const pendingChats = recentChatSessions.filter((s) => {
    const last = s.messages[0];
    if (!last) return false;
    if (last.role !== "user") return false;
    return last.createdAt >= chatCutoff;
  }).length;

  const matchedIds = unreadInbound
    .map((e) => e.contactId)
    .filter((id): id is string => !!id);
  const contacts =
    matchedIds.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: matchedIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const unrepliedSenders: UnrepliedSender[] = unreadInbound.slice(0, 10).map((e) => {
    const c = e.contactId ? contactById.get(e.contactId) : null;
    const name = c
      ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email.split("@")[0]
      : e.fromName?.trim() || e.fromEmail.split("@")[0];
    return {
      // Match-contact rows use the contactId directly so the dropdown's
      // existing /admin/contacts/[id] href keeps working. Stranger rows use
      // an "inbox:<id>" sentinel so top-nav can route to /admin/inbox.
      contactId: c ? c.id : `inbox:${e.id}`,
      name,
      email: c?.email || e.fromEmail,
      latestSubject: e.subject || "(no subject)",
      preview: (e.bodyText || "").replace(/\s+/g, " ").trim().slice(0, 120),
      receivedAt: e.receivedAt.toISOString(),
    };
  });

  return {
    pendingChats,
    unrepliedEmails: unrepliedSenders.length,
    unrepliedSenders,
  };
}

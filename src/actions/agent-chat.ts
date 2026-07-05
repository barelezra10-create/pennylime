"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/emails/send";

const OFFLINE_THRESHOLD_SECONDS = 30;
const ONLINE_THRESHOLD_MS = OFFLINE_THRESHOLD_SECONDS * 1000;

/**
 * Admin takes over an AI chat session. Future user messages do not
 * trigger an AI turn — they sit in the message log waiting for a
 * human-typed reply.
 */
export async function takeOverChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const updated = await prisma.agentSession.update({
    where: { id: sessionId },
    data: { mode: "human" },
    select: { id: true, mode: true, contactId: true },
  });

  // Log on the linked contact's timeline so it shows in CRM.
  if (updated.contactId) {
    await prisma.activity.create({
      data: {
        contactId: updated.contactId,
        type: "chat_takeover",
        title: "Chat taken over by team",
        performedBy: session.user.email,
      },
    });
  }

  revalidatePath(`/admin/agent/sessions/${sessionId}`);
  revalidatePath("/admin/agent/sessions");
  return { ok: true as const, mode: updated.mode };
}

/**
 * Admin releases the chat back to the AI agent.
 */
export async function releaseChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const updated = await prisma.agentSession.update({
    where: { id: sessionId },
    data: { mode: "ai" },
    select: { id: true, mode: true },
  });
  revalidatePath(`/admin/agent/sessions/${sessionId}`);
  revalidatePath("/admin/agent/sessions");
  return { ok: true as const, mode: updated.mode };
}

/**
 * Admin replies to a chat session. Stores the message tagged with the
 * admin's email so the widget can render it as a human reply. If the
 * user hasn't polled in > 30 seconds (treat as offline), also sends
 * the message via email so they don't miss it.
 */
export async function sendChatAdminReply(input: { sessionId: string; text: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const text = input.text.trim();
  if (!text) return { ok: false as const, error: "Message required" };
  if (text.length > 4000) return { ok: false as const, error: "Message too long" };

  const ag = await prisma.agentSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      contactId: true,
      leadFirstName: true,
      leadEmail: true,
      lastPolledAt: true,
      contact: { select: { firstName: true, email: true } },
    },
  });
  if (!ag) return { ok: false as const, error: "Session not found" };

  const msg = await prisma.agentMessage.create({
    data: {
      sessionId: input.sessionId,
      role: "assistant",
      senderEmail: session.user.email,
      text,
    },
  });

  // Auto-flip to human mode on first admin reply so subsequent user
  // messages don't trigger AI. Also mark waiting on client since we just replied.
  await prisma.agentSession.update({
    where: { id: input.sessionId },
    data: { mode: "human", handlingStatus: "WAITING_CLIENT", adminLastReadAt: new Date() },
  });

  // Offline check — if the user's widget hasn't polled in ≥ threshold,
  // they're probably not watching. Email the reply too.
  const offlineSince = ag.lastPolledAt
    ? (Date.now() - ag.lastPolledAt.getTime()) / 1000
    : Infinity;
  const toEmail = ag.contact?.email ?? ag.leadEmail;
  const toName = ag.contact?.firstName ?? ag.leadFirstName ?? "there";
  let emailed = false;

  if (toEmail && offlineSince > OFFLINE_THRESHOLD_SECONDS) {
    const html = `
<p>Hi ${escapeHtml(toName)},</p>
<p>You stepped away from your PennyLime chat — here's the reply from our team:</p>
<blockquote style="border-left: 3px solid #15803d; padding: 8px 12px; margin: 12px 0; background: #f0fdf4; color: #1f2937;">
  ${escapeHtml(text).replace(/\n/g, "<br>")}
</blockquote>
<p>You can reply directly to this email and we'll continue the conversation, or reopen the chat on pennylime.com to keep going.</p>
<p>Thanks,<br>The PennyLime Team</p>
`;
    const r = await sendEmail({
      to: toEmail,
      subject: "PennyLime — reply to your chat",
      html,
    });
    if (r.success) {
      emailed = true;
      await prisma.agentMessage.update({
        where: { id: msg.id },
        data: { emailedAt: new Date() },
      });
      if (ag.contactId) {
        await prisma.activity.create({
          data: {
            contactId: ag.contactId,
            type: "email_sent",
            title: `Offline chat reply emailed: ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`,
            performedBy: session.user.email,
          },
        });
      }
    }
  }

  if (ag.contactId) {
    await prisma.activity.create({
      data: {
        contactId: ag.contactId,
        type: "chat_admin_reply",
        title: "Replied in chat",
        details: text.slice(0, 200),
        performedBy: session.user.email,
      },
    });
  }

  revalidatePath(`/admin/agent/sessions/${input.sessionId}`);
  return { ok: true as const, messageId: msg.id, emailed };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Admin chats inbox -------------------------------------------------------

export async function markChatRead(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { adminLastReadAt: new Date() } });
  return { ok: true as const };
}

export type ChatConversationRow = {
  id: string;
  name: string;
  subject: string;
  contactId: string | null;
  mode: string;
  handlingStatus: string;
  archived: boolean;
  startedAt: string;
  online: boolean;
  needsReply: boolean;
  unread: boolean;
  waitingSinceMs: number | null;
  lastMessage: { text: string; at: string; authoredBy: "user" | "ai" | "admin" } | null;
};

export async function listChatConversations(
  filter: "needs-reply" | "open" | "resolved" | "all" | "archived"
): Promise<ChatConversationRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const where: Record<string, unknown> = { channel: "chat" };
  if (filter === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
    if (filter === "open" || filter === "needs-reply") {
      where.handlingStatus = { not: "RESOLVED" };
    } else if (filter === "resolved") {
      where.handlingStatus = "RESOLVED";
    }
    // "all": no handlingStatus constraint
  }

  const sessions = await prisma.agentSession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      contactId: true,
      mode: true,
      handlingStatus: true,
      archivedAt: true,
      startedAt: true,
      lastPolledAt: true,
      adminLastReadAt: true,
      leadFirstName: true,
      leadEmail: true,
      contact: { select: { firstName: true, lastName: true } },
      messages: {
        where: { role: { in: ["user", "assistant"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { role: true, senderEmail: true, text: true, createdAt: true },
      },
    },
  });

  // Batch-fetch the first user message per session using distinct on sessionId
  // ordered ascending — Prisma returns rows in orderBy order and keeps the first
  // occurrence of each distinct value, so this yields the earliest user message
  // per session in one query.
  const ids = sessions.map((s) => s.id);
  const firstUserMessages = ids.length
    ? await prisma.agentMessage.findMany({
        where: { sessionId: { in: ids }, role: "user" },
        orderBy: { createdAt: "asc" },
        distinct: ["sessionId"],
        select: { sessionId: true, text: true },
      })
    : [];
  const firstMsgMap = new Map(firstUserMessages.map((m) => [m.sessionId, m.text]));

  const now = Date.now();
  const rows: ChatConversationRow[] = sessions.map((s) => {
    const last = s.messages[0] ?? null;
    const needsReply = !!last && last.role === "user";
    const name =
      (s.contact ? `${s.contact.firstName} ${s.contact.lastName || ""}`.trim() : "") ||
      s.leadFirstName ||
      s.leadEmail ||
      "Anonymous";
    const rawSubject = firstMsgMap.get(s.id);
    const subject = rawSubject ? rawSubject.trim().slice(0, 80) : "New conversation";
    return {
      id: s.id,
      name,
      subject,
      contactId: s.contactId,
      mode: s.mode,
      handlingStatus: s.handlingStatus,
      archived: !!s.archivedAt,
      startedAt: s.startedAt.toISOString(),
      online: !!s.lastPolledAt && now - s.lastPolledAt.getTime() < ONLINE_THRESHOLD_MS,
      needsReply,
      unread: !!last && (!s.adminLastReadAt || last.createdAt.getTime() > s.adminLastReadAt.getTime()),
      waitingSinceMs: needsReply && last ? last.createdAt.getTime() : null,
      lastMessage: last
        ? {
            text: last.text.slice(0, 120),
            at: last.createdAt.toISOString(),
            authoredBy: last.senderEmail ? "admin" : last.role === "assistant" ? "ai" : "user",
          }
        : null,
    };
  });

  if (filter === "needs-reply") return rows.filter((r) => r.needsReply);
  return rows;
}

export type ChatThreadItem =
  | { kind: "message"; id: string; authoredBy: "user" | "ai" | "admin"; text: string; emailed: boolean; createdAt: string }
  | { kind: "tool"; id: string; name: string; status: string; summary: string | null; createdAt: string };

export async function getChatConversation(sessionId: string, sinceIso?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const ag = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      contactId: true,
      mode: true,
      handlingStatus: true,
      archivedAt: true,
      startedAt: true,
      lastPolledAt: true,
      leadFirstName: true,
      leadEmail: true,
      contact: { select: { firstName: true, lastName: true } },
    },
  });
  if (!ag) return null;

  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const [messages, tools, firstUserMsg] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { sessionId, createdAt: { gt: since }, role: { in: ["user", "assistant"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, senderEmail: true, emailedAt: true, text: true, createdAt: true },
    }),
    prisma.agentToolCall.findMany({
      where: { sessionId, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, name: true, resultStatus: true, resultSummary: true, createdAt: true },
    }),
    prisma.agentMessage.findFirst({
      where: { sessionId, role: "user" },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    }),
  ]);

  const items: ChatThreadItem[] = [
    ...messages.map((m): ChatThreadItem => ({
      kind: "message",
      id: m.id,
      authoredBy: m.senderEmail ? ("admin" as const) : m.role === "assistant" ? ("ai" as const) : ("user" as const),
      text: m.text,
      emailed: !!m.emailedAt,
      createdAt: m.createdAt.toISOString(),
    })),
    ...tools.map((t): ChatThreadItem => ({
      kind: "tool",
      id: t.id,
      name: t.name,
      status: t.resultStatus,
      summary: t.resultSummary,
      createdAt: t.createdAt.toISOString(),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const name =
    (ag.contact ? `${ag.contact.firstName} ${ag.contact.lastName || ""}`.trim() : "") ||
    ag.leadFirstName ||
    ag.leadEmail ||
    "Anonymous";

  const subject = firstUserMsg ? firstUserMsg.text.trim().slice(0, 80) : "New conversation";

  return {
    session: {
      id: ag.id,
      name,
      subject,
      contactId: ag.contactId,
      mode: ag.mode,
      handlingStatus: ag.handlingStatus,
      archived: !!ag.archivedAt,
      online: !!ag.lastPolledAt && Date.now() - ag.lastPolledAt.getTime() < ONLINE_THRESHOLD_MS,
    },
    items,
  };
}

export async function setChatHandlingStatus(sessionId: string, status: "OPEN" | "WAITING_CLIENT" | "RESOLVED") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { handlingStatus: status } });
  return { ok: true as const };
}

export async function archiveChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { archivedAt: new Date() } });
  return { ok: true as const };
}

export async function unarchiveChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { archivedAt: null } });
  return { ok: true as const };
}

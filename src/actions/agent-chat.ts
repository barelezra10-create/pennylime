"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/emails/send";

const OFFLINE_THRESHOLD_SECONDS = 30;

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
  // messages don't trigger AI.
  await prisma.agentSession.update({
    where: { id: input.sessionId },
    data: { mode: "human" },
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

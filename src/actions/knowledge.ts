"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/emails/send";

export type KnowledgeRow = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  timesSent: number;
  waiterCount: number;
  pendingWaiterCount: number;
  createdAt: string;
  answeredAt: string | null;
};

export async function listKnowledge(status: "PENDING" | "ANSWERED" | "DISABLED"): Promise<KnowledgeRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  const rows = await prisma.knowledgeEntry.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { waiters: { select: { notifiedAt: true } } },
  });
  const mapped = rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    status: r.status,
    timesSent: r.timesSent,
    waiterCount: r.waiters.length,
    pendingWaiterCount: r.waiters.filter((w) => !w.notifiedAt).length,
    createdAt: r.createdAt.toISOString(),
    answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
  }));
  if (status === "PENDING") mapped.sort((a, b) => b.pendingWaiterCount - a.pendingWaiterCount || a.createdAt.localeCompare(b.createdAt));
  return mapped;
}

export async function answerKnowledgeEntry(entryId: string, answer: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const text = answer.trim();
  if (!text) return { ok: false as const, error: "Answer required" };

  const entry = await prisma.knowledgeEntry.update({
    where: { id: entryId },
    data: { answer: text, status: "ANSWERED", answeredBy: session.user.email, answeredAt: new Date() },
    include: { waiters: { where: { notifiedAt: null } } },
  });

  let sent = 0;
  let emailed = 0;
  for (const waiter of entry.waiters) {
    const ag = await prisma.agentSession.findUnique({
      where: { id: waiter.sessionId },
      select: {
        id: true,
        archivedAt: true,
        lastPolledAt: true,
        leadFirstName: true,
        leadEmail: true,
        contact: { select: { firstName: true, email: true } },
      },
    });
    if (!ag || ag.archivedAt) {
      await prisma.knowledgeWaiter.update({ where: { id: waiter.id }, data: { notifiedAt: new Date() } });
      continue;
    }
    const msg = await prisma.agentMessage.create({
      data: { sessionId: ag.id, role: "assistant", senderEmail: null, text },
    });
    await prisma.agentSession.update({ where: { id: ag.id }, data: { handlingStatus: "WAITING_CLIENT" } });
    sent++;

    const offline = !ag.lastPolledAt || Date.now() - ag.lastPolledAt.getTime() > 30_000;
    const toEmail = ag.contact?.email ?? ag.leadEmail;
    if (offline && toEmail) {
      const toName = ag.contact?.firstName ?? ag.leadFirstName ?? "there";
      try {
        const html = `
<p>Hi ${escapeHtml(toName)},</p>
<p>You asked us a question on PennyLime and we now have an answer for you.</p>
<p><strong>Your question:</strong></p>
<blockquote style="border-left: 3px solid #15803d; padding: 8px 12px; margin: 12px 0; background: #f0fdf4; color: #1f2937;">
  ${escapeHtml(entry.question).replace(/\n/g, "<br>")}
</blockquote>
<p><strong>Our answer:</strong></p>
<blockquote style="border-left: 3px solid #15803d; padding: 8px 12px; margin: 12px 0; background: #f0fdf4; color: #1f2937;">
  ${escapeHtml(text).replace(/\n/g, "<br>")}
</blockquote>
<p>If you have more questions, feel free to reopen the chat on <a href="https://pennylime.com">pennylime.com</a> and we will be happy to help.</p>
<p>Thanks,<br>The PennyLime Team</p>
`;
        const r = await sendEmail({
          to: toEmail,
          subject: "You have a reply from PennyLime",
          html,
        });
        if (r.success) {
          await prisma.agentMessage.update({ where: { id: msg.id }, data: { emailedAt: new Date() } });
          emailed++;
        }
      } catch {}
    }
    await prisma.knowledgeWaiter.update({ where: { id: waiter.id }, data: { notifiedAt: new Date() } });
  }

  if (sent > 0) {
    await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { timesSent: { increment: sent } } });
  }
  return { ok: true as const, sent, emailed };
}

export async function updateKnowledgeAnswer(entryId: string, answer: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const text = answer.trim();
  if (!text) return { ok: false as const, error: "Answer required" };
  await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { answer: text } });
  return { ok: true as const };
}

export async function setKnowledgeStatus(entryId: string, status: "ANSWERED" | "DISABLED") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { status } });
  return { ok: true as const };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

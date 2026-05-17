import { NextRequest } from "next/server";
import { runTurn } from "@/lib/ai-agent/runTurn";
import { prisma } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

/**
 * POST /api/agent/chat
 *
 * Single entry point for the website chat widget. Three jobs:
 *
 * 1. Lead capture — the first call from a brand-new widget includes
 *    {leadFirstName, leadEmail}. Upserts a Contact, creates an
 *    AgentSession with mode="ai", returns the sessionId.
 *
 * 2. Subsequent user messages — if session.mode === "ai" runs a Gemini
 *    turn; if "human" (admin took over) just stores the user message
 *    and returns silently so the user keeps typing while waiting on
 *    an admin reply.
 *
 * 3. Long-poll for new messages — when `sinceMessageId` is sent, no AI
 *    turn runs; instead returns any AgentMessage rows newer than that
 *    id (admin replies during takeover).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = body.text ? String(body.text).trim() : "";
  const sessionId = body.sessionId ? String(body.sessionId) : null;
  const leadFirstName = body.leadFirstName ? String(body.leadFirstName).trim().slice(0, 80) : null;
  const leadLastName = body.leadLastName ? String(body.leadLastName).trim().slice(0, 80) : null;
  const leadEmail = body.leadEmail ? String(body.leadEmail).trim().toLowerCase().slice(0, 254) : null;
  const sinceMessageId = body.sinceMessageId ? String(body.sinceMessageId) : null;

  // Long-poll path. Returns new messages since the last one the client saw.
  if (sessionId && sinceMessageId !== null) {
    return handlePoll(sessionId, sinceMessageId);
  }

  // Lead-capture / start-session path.
  if (!sessionId && (!leadFirstName || !leadEmail)) {
    return Response.json(
      { error: "leadFirstName and leadEmail required to start a chat" },
      { status: 400 },
    );
  }
  if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
    return Response.json({ error: "invalid email" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Resolve / create the session.
  let sid = sessionId;
  let session = sid
    ? await prisma.agentSession.findUnique({ where: { id: sid } })
    : null;

  if (!session) {
    sid = sid ?? randomUUID();
    // Upsert contact by email (chat = new lead source).
    let contactId: string | null = null;
    if (leadEmail) {
      const existing = await prisma.contact.findUnique({ where: { email: leadEmail } });
      if (existing) {
        contactId = existing.id;
      } else {
        const created = await prisma.contact.create({
          data: {
            email: leadEmail,
            firstName: leadFirstName ?? "Visitor",
            lastName: leadLastName,
            source: "chat",
            stage: "LEAD",
          },
        });
        contactId = created.id;
        await prisma.activity.create({
          data: {
            contactId: created.id,
            type: "chat_started",
            title: "Started a chat",
            performedBy: "chat-widget",
          },
        });
      }
    }
    session = await prisma.agentSession.create({
      data: {
        id: sid,
        channel: "chat",
        contactId,
        authLevel: "anon",
        leadFirstName,
        leadLastName,
        leadEmail,
        lastPolledAt: new Date(),
        metadata: { ip: ip ?? undefined, userAgent } as object,
      },
    });

    // Fire admin notification (best-effort, never blocks chat start).
    if (leadFirstName && leadEmail) {
      const { notifyAdmins, getAdminUrl } = await import("@/lib/notify");
      const url = `${getAdminUrl()}/admin/agent/sessions/${session.id}`;
      notifyAdmins("chatStarted", {
        subject: `New chat from ${leadFirstName} — PennyLime`,
        html: `<p><strong>${escapeHtml(leadFirstName)}${leadLastName ? " " + escapeHtml(leadLastName) : ""}</strong> just started a chat on pennylime.com.</p>
<ul>
  <li>Email: <a href="mailto:${escapeHtml(leadEmail)}">${escapeHtml(leadEmail)}</a></li>
</ul>
<p><a href="${url}">View session in admin</a></p>`,
      }).catch(() => {});
    }
  } else {
    // Existing session — bump lastPolledAt every time the user sends.
    await prisma.agentSession.update({
      where: { id: session.id },
      data: { lastPolledAt: new Date() },
    });
  }

  // No text yet — just creating the session.
  if (!text) {
    return Response.json({ sessionId: session.id, mode: session.mode, reply: null });
  }

  if (text.length > 2000) {
    return Response.json({ error: "too long" }, { status: 400 });
  }

  // Human-takeover mode: store the user message, don't run AI. Admin
  // sees it on the sessions page and replies manually.
  if (session.mode === "human") {
    const msg = await prisma.agentMessage.create({
      data: { sessionId: session.id, role: "user", text },
    });
    return Response.json({
      sessionId: session.id,
      mode: "human",
      reply: null,
      lastMessageId: msg.id,
    });
  }

  // Normal AI turn.
  try {
    const out = await runTurn(text, {
      channel: "chat",
      sessionId: session.id,
      contactId: session.contactId ?? undefined,
      authLevel: (session.authLevel ?? "anon") as "anon" | "phone-matched" | "verified",
      metadata: { ip: ip ?? undefined, userAgent },
    });
    return Response.json({
      sessionId: session.id,
      mode: "ai",
      reply: out.reply,
      newAuthLevel: out.newAuthLevel ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "agent error" },
      { status: 500 },
    );
  }
}

async function handlePoll(sessionId: string, sinceMessageId: string) {
  await prisma.agentSession
    .update({
      where: { id: sessionId },
      data: { lastPolledAt: new Date() },
    })
    .catch(() => {});

  // sinceMessageId === "" means "everything from the start".
  const cursor = sinceMessageId
    ? await prisma.agentMessage.findUnique({ where: { id: sinceMessageId } })
    : null;
  const since = cursor?.createdAt ?? new Date(0);

  const newer = await prisma.agentMessage.findMany({
    where: {
      sessionId,
      createdAt: { gt: since },
      role: { in: ["assistant", "user"] },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, role: true, text: true, senderEmail: true, createdAt: true },
  });

  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { mode: true },
  });

  return Response.json({
    sessionId,
    mode: session?.mode ?? "ai",
    messages: newer.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      // role="assistant" + senderEmail set = human admin reply.
      // Tag it for the widget so we can show a different style.
      authoredBy: m.senderEmail ? "admin" : m.role === "assistant" ? "ai" : "user",
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
  const sinceMessageId = typeof body.sinceMessageId === "string" ? body.sinceMessageId : null;
  const passive = body.passive === true;

  // Probe — portal-cookie identity check without touching sessions.
  // A portal visitor opening the panel for the first time sends this so
  // we can skip the intro gate without creating an empty AgentSession.
  if (body.probe === true) {
    try {
      const { getPortalApplicationId } = await import("@/lib/portal-auth");
      const applicationId = await getPortalApplicationId();
      if (applicationId) {
        const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { firstName: true } });
        if (app) return Response.json({ identified: true, visitorName: app.firstName ?? null });
      }
    } catch {}
    return Response.json({ identified: false, visitorName: null });
  }

  // Long-poll path. Returns new messages since the last one the client saw.
  if (sessionId && sinceMessageId !== null) {
    return handlePoll(sessionId, sinceMessageId, passive);
  }

  // Lead-capture / start-session path. Lead info is now optional —
  // visitors can ask general questions without identifying themselves.
  // We only validate the format of anything that IS provided. Tools
  // that need identity will prompt for it later in the conversation.
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
  let isNewSession = false;

  if (!session) {
    isNewSession = true;
    sid = sid ?? randomUUID();
    // Upsert contact by email (chat = new lead source).
    let contactId: string | null = null;
    if (leadEmail) {
      const existing = await prisma.contact.findUnique({ where: { email: leadEmail } });
      if (existing) {
        contactId = existing.id;
        await healPlaceholderName(existing, leadFirstName, leadLastName);
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
    await recognizePortalVisitor(session.id);

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
    // Existing session — bump lastPolledAt + late-bind lead info if
    // this is the call where the visitor decided to identify themselves
    // ("Save chat to inbox"). Upsert a Contact in the same shot.
    let contactIdUpdate: string | null | undefined = undefined;
    if (leadEmail && !session.contactId) {
      const existing = await prisma.contact.findUnique({ where: { email: leadEmail } });
      if (existing) {
        contactIdUpdate = existing.id;
        await healPlaceholderName(existing, leadFirstName, leadLastName);
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
        contactIdUpdate = created.id;
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
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        lastPolledAt: new Date(),
        ...(leadFirstName && !session.leadFirstName ? { leadFirstName } : {}),
        ...(leadLastName && !session.leadLastName ? { leadLastName } : {}),
        ...(leadEmail && !session.leadEmail ? { leadEmail } : {}),
        ...(contactIdUpdate ? { contactId: contactIdUpdate } : {}),
      },
    });
  }

  // No text yet — just creating the session.
  if (!text) {
    const fresh = await prisma.agentSession.findUnique({
      where: { id: session.id },
      select: { contactId: true, leadEmail: true, leadFirstName: true },
    });
    return Response.json({
      sessionId: session.id,
      mode: session.mode,
      reply: null,
      identified: !!(fresh?.contactId || fresh?.leadEmail),
      visitorName: fresh?.leadFirstName ?? null,
    });
  }

  if (text.length > 2000) {
    return Response.json({ error: "too long" }, { status: 400 });
  }

  // Re-open the ticket whenever the user sends a message. This runs for both
  // human-takeover and AI paths — a new user message always needs attention.
  await prisma.agentSession.update({
    where: { id: session.id },
    data: { handlingStatus: "OPEN" },
  });

  // Human-takeover mode: store the user message, don't run AI. Admin
  // sees it on the sessions page and replies manually.
  if (session.mode === "human") {
    const msg = await prisma.agentMessage.create({
      data: { sessionId: session.id, role: "user", text },
    });
    if (!session.contactId) await recognizePortalVisitor(session.id);
    const humanSessionFresh = await prisma.agentSession.findUnique({
      where: { id: session.id },
      select: { contactId: true, leadEmail: true, leadFirstName: true },
    });
    return Response.json({
      sessionId: session.id,
      mode: "human",
      reply: null,
      lastMessageId: msg.id,
      identified: !!(humanSessionFresh?.contactId || humanSessionFresh?.leadEmail),
      visitorName: humanSessionFresh?.leadFirstName ?? null,
    });
  }

  // Normal AI turn.
  // For existing sessions without a linked contact, try to recognise the
  // visitor via their portal cookie (new sessions already ran recognition
  // right after creation above).
  if (!isNewSession && !session.contactId) {
    await recognizePortalVisitor(session.id);
  }
  const aiSessionFresh = await prisma.agentSession.findUnique({
    where: { id: session.id },
    select: { contactId: true, leadEmail: true, leadFirstName: true },
  });
  const identified = !!(aiSessionFresh?.contactId || aiSessionFresh?.leadEmail);
  const visitorName: string | null = aiSessionFresh?.leadFirstName ?? null;

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
      identified,
      visitorName,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "agent error" },
      { status: 500 },
    );
  }
}

/**
 * The apply funnel creates contacts as "Applicant" before the borrower
 * types their name. When the chat later captures a real name for the
 * same email, repair the contact record so the CRM shows the person.
 */
async function healPlaceholderName(
  contact: { id: string; firstName: string; lastName: string | null },
  leadFirstName: string | null,
  leadLastName: string | null
): Promise<void> {
  const isPlaceholder = (contact.firstName === "Applicant" || contact.firstName === "Visitor") && !contact.lastName;
  if (!isPlaceholder || !leadFirstName || leadFirstName === "Applicant" || leadFirstName === "Visitor") return;
  await prisma.contact
    .update({
      where: { id: contact.id },
      data: { firstName: leadFirstName, ...(leadLastName ? { lastName: leadLastName } : {}) },
    })
    .catch(() => {});
}

async function recognizePortalVisitor(sessionId: string): Promise<void> {
  try {
    const { getPortalApplicationId } = await import("@/lib/portal-auth");
    const applicationId = await getPortalApplicationId();
    if (!applicationId) return;
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { firstName: true, email: true, contact: { select: { id: true } } },
    });
    if (!app) return;
    let contactId = app.contact?.id ?? null;
    if (!contactId && app.email) {
      const c = await prisma.contact.findFirst({
        where: { email: { equals: app.email, mode: "insensitive" } },
        select: { id: true },
      });
      contactId = c?.id ?? null;
    }
    const current = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { contactId: true, leadFirstName: true, leadEmail: true },
    });
    if (!current) return;
    // A session that already carries someone's identity keeps it; the portal
    // cookie only fills gaps (shared-device protection).
    if (current.contactId || current.leadEmail) {
      // Only bump auth level when the cookie's application matches the session's existing identity by email.
      if (current.leadEmail && app.email && current.leadEmail.toLowerCase() === app.email.toLowerCase()) {
        await prisma.agentSession.update({
          where: { id: sessionId },
          data: { authLevel: "verified", ...(contactId && !current.contactId ? { contactId } : {}) },
        });
      }
      return;
    }
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: { ...(contactId ? { contactId } : {}), leadFirstName: app.firstName, leadEmail: app.email, authLevel: "verified" },
    });
  } catch {}
}

async function handlePoll(sessionId: string, sinceMessageId: string, passive = false) {
  // Closed-widget background polls must not count as "online" presence,
  // otherwise the offline email fallback for admin replies never fires.
  if (!passive) {
    await prisma.agentSession
      .update({
        where: { id: sessionId },
        data: { lastPolledAt: new Date() },
      })
      .catch(() => {});
  }

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
    select: { mode: true, contactId: true, leadEmail: true, leadFirstName: true },
  });

  return Response.json({
    sessionId,
    mode: session?.mode ?? "ai",
    identified: !!(session?.contactId || session?.leadEmail),
    visitorName: session?.leadFirstName ?? null,
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

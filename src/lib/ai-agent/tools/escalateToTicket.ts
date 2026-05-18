import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

export const escalateToTicket: ToolDefinition = {
  name: "escalateToTicket",
  description:
    "Hand the conversation off to a human specialist. Creates a support ticket, flips the chat into human-takeover mode (admin will reply), and logs an activity on the contact's CRM timeline. Call this whenever you cannot move the user forward, when the user explicitly asks for a human, when you have tried the same tool twice without resolving, or when the user expresses frustration.",
  parameters: {
    type: "object",
    properties: { reason: { type: "string", description: "Short why-the-escalation summary." } },
    required: ["reason"],
  },
  requiredAuth: "anon",
  isWrite: false,
  handler: async (args, ctx) => {
    const reason = String(args.reason ?? "unspecified");
    const messages = await prisma.agentMessage.findMany({
      where: { sessionId: ctx.sessionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const transcript = messages
      .reverse()
      .map((m) => `[${m.role}] ${m.text}`)
      .join("\n");
    const ticket = await prisma.supportTicket.create({
      data: { sessionId: ctx.sessionId, contactId: ctx.contactId, reason, transcript },
    });

    // Flip the session into human-takeover mode so the chat route stops
    // running AI turns and the admin sessions page surfaces it for reply.
    // Voice/SMS sessions don't have an admin-takeover surface yet, so only
    // chat sessions get the mode flip.
    if (ctx.channel === "chat") {
      await prisma.agentSession
        .update({ where: { id: ctx.sessionId }, data: { mode: "human" } })
        .catch(() => {});
    }

    // CRM timeline entry so the contact-detail view shows the escalation.
    if (ctx.contactId) {
      await prisma.activity
        .create({
          data: {
            contactId: ctx.contactId,
            type: "chat_escalated",
            title: `AI escalated chat: ${reason}`,
            performedBy: "ai-agent",
          },
        })
        .catch(() => {});
    }

    return {
      status: "ok",
      data: {
        ticketId: ticket.id,
        message:
          "Tell the user a specialist will reply here shortly, and that they can keep typing. Do not promise a specific timeframe.",
      },
      summary: `escalated to human: ${reason}`,
    };
  },
};

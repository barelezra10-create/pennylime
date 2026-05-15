import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

export const escalateToTicket: ToolDefinition = {
  name: "escalateToTicket",
  description: "Create a support ticket so a human can follow up. Use when the issue is beyond what you can resolve.",
  parameters: {
    type: "object",
    properties: { reason: { type: "string" } },
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
    return { status: "ok", data: { ticketId: ticket.id }, summary: `ticket created: ${reason}` };
  },
};

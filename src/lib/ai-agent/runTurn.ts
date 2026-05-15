import "server-only";
import { prisma } from "@/lib/db";
import { callGemini, type GeminiTurn } from "./gemini";
import { buildSystemPrompt } from "./systemPrompt";
import { getTool, listToolsForAuth, toolToGeminiDecl } from "./tools";
import { meetsAuth } from "./authGate";
import { redactPII } from "./redact";
import { redactToolArgs } from "./redactToolArgs";
import { tokensToCostCents } from "./cost";
import type { AgentCtx, AuthLevel, ToolResult } from "./types";

const MAX_TOOL_CALLS_PER_TURN = 5;
const COST_HARD_CAP_CENTS = 200;

async function loadHistory(sessionId: string): Promise<GeminiTurn[]> {
  const rows = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  const turns: GeminiTurn[] = [];
  for (const r of rows) {
    if (r.role === "user") turns.push({ role: "user", parts: [{ text: r.text }] });
    else if (r.role === "assistant") turns.push({ role: "model", parts: [{ text: r.text }] });
  }
  return turns;
}

async function buildContactSummary(ctx: AgentCtx): Promise<string | null> {
  if (!ctx.contactId) return null;
  const c = await prisma.contact.findUnique({
    where: { id: ctx.contactId },
    include: { application: { select: { applicationCode: true, status: true, addressState: true } } },
  });
  if (!c) return null;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const app = c.application;
  return [
    `Contact: ${name || "(no name)"}`,
    app ? `Application: ${app.applicationCode} (${app.status}, ${app.addressState ?? "?"})` : "no application on file",
  ].join(". ");
}

export async function runTurn(
  userText: string,
  ctx: AgentCtx,
): Promise<{ reply: string; newAuthLevel?: AuthLevel; cappedAt?: "tool_loop" | "cost" }> {
  await prisma.agentSession.upsert({
    where: { id: ctx.sessionId },
    create: {
      id: ctx.sessionId,
      channel: ctx.channel,
      contactId: ctx.contactId,
      authLevel: ctx.authLevel,
      metadata: ctx.metadata as object,
    },
    update: {},
  });

  await prisma.agentMessage.create({
    data: { sessionId: ctx.sessionId, role: "user", text: redactPII(userText) },
  });

  const history = await loadHistory(ctx.sessionId);
  let currentAuth: AuthLevel = ctx.authLevel;
  let totalCostCents = 0;
  let reply = "";

  for (let iter = 0; iter < MAX_TOOL_CALLS_PER_TURN + 1; iter++) {
    const tools = listToolsForAuth(currentAuth).map(toolToGeminiDecl);
    const contactSummary = await buildContactSummary({ ...ctx, authLevel: currentAuth });
    const sys = buildSystemPrompt({ ...ctx, authLevel: currentAuth }, contactSummary);

    const result = await callGemini(sys, history, tools);
    totalCostCents += tokensToCostCents(result.tokensIn, result.tokensOut);

    if (totalCostCents > COST_HARD_CAP_CENTS) {
      await prisma.supportTicket.create({
        data: { sessionId: ctx.sessionId, contactId: ctx.contactId, reason: "cost_cap", transcript: "" },
      });
      reply = "Let me create a ticket so the team can follow up directly.";
      await prisma.agentSession.update({
        where: { id: ctx.sessionId },
        data: { endedAt: new Date(), endReason: "cost_cap" },
      });
      await prisma.agentMessage.create({
        data: { sessionId: ctx.sessionId, role: "assistant", text: reply },
      });
      return { reply, cappedAt: "cost" };
    }

    if (result.text && !result.functionCall) {
      reply = result.text;
      break;
    }

    if (!result.functionCall) {
      reply = "Sorry, I did not catch that. Could you say it another way?";
      break;
    }

    const tool = getTool(result.functionCall.name);
    const startedAt = Date.now();
    let toolResult: ToolResult;
    if (!tool) {
      toolResult = { status: "error", message: `unknown tool ${result.functionCall.name}` };
    } else if (!meetsAuth(currentAuth, tool.requiredAuth)) {
      toolResult = { status: "denied_auth", required: tool.requiredAuth };
    } else {
      try {
        toolResult = await tool.handler(result.functionCall.args, { ...ctx, authLevel: currentAuth });
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool error";
        toolResult = { status: "error", message };
        await prisma.agentError.create({
          data: { sessionId: ctx.sessionId, toolName: result.functionCall.name, message },
        });
      }
    }

    await prisma.agentToolCall.create({
      data: {
        sessionId: ctx.sessionId,
        name: result.functionCall.name,
        argsRedacted: redactToolArgs(result.functionCall.name, result.functionCall.args) as object,
        resultStatus: toolResult.status,
        resultSummary: "summary" in toolResult ? toolResult.summary ?? null : null,
        errorMessage: toolResult.status === "error" ? toolResult.message : null,
        durationMs: Date.now() - startedAt,
      },
    });

    // Auth upgrade on successful verifyIdentity
    if (result.functionCall.name === "verifyIdentity" && toolResult.status === "ok") {
      const data = toolResult.data as { verified?: boolean };
      if (data.verified) currentAuth = "verified";
    }

    history.push({
      role: "model",
      parts: [{ functionCall: { name: result.functionCall.name, args: result.functionCall.args } }],
    });
    history.push({
      role: "function",
      parts: [{
        functionResponse: {
          name: result.functionCall.name,
          response: toolResult as unknown as Record<string, unknown>,
        },
      }],
    });
  }

  if (!reply) {
    reply = "Let me create a ticket and have someone follow up.";
    await prisma.supportTicket.create({
      data: { sessionId: ctx.sessionId, contactId: ctx.contactId, reason: "tool_loop", transcript: "" },
    });
  }

  await prisma.agentMessage.create({
    data: { sessionId: ctx.sessionId, role: "assistant", text: reply },
  });
  await prisma.agentSession.update({
    where: { id: ctx.sessionId },
    data: { costCents: { increment: Math.round(totalCostCents) }, authLevel: currentAuth },
  });

  return { reply, newAuthLevel: currentAuth !== ctx.authLevel ? currentAuth : undefined };
}

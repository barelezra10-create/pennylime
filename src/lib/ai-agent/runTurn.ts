// runTurn runs in two host processes: the Next.js web app (API routes) and the
// pennylime-voice Node service. It must not depend on the `server-only` marker.
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
const MAX_CONSECUTIVE_VERIFY_FAILS = 3;

// Server-side escalation triggers — bypass the model when the user's intent
// is unambiguous. The model's prompt also tells it to escalate, but production
// transcripts show the model often retries verifyIdentity instead of obeying.
const HUMAN_REQUEST_PATTERNS = [
  /\b(human|agent|representative|rep)\b/i,
  /\breal\s+person\b/i,
  /\blive\s+person\b/i,
  /\b(speak|talk)\s+(to|with)\s+(a|an|someone|a\s+person|a\s+human)\b/i,
  /\bget\s+(a|an)\s+(human|agent|person)\b/i,
  /\bcustomer\s+service\b/i,
  /\bsupport\s+team\b/i,
];

function userAsksForHuman(text: string): boolean {
  return HUMAN_REQUEST_PATTERNS.some((p) => p.test(text));
}

async function countConsecutiveVerifyFails(sessionId: string): Promise<number> {
  const recent = await prisma.agentToolCall.findMany({
    where: { sessionId, name: "verifyIdentity" },
    orderBy: { createdAt: "desc" },
    take: MAX_CONSECUTIVE_VERIFY_FAILS,
    select: { resultStatus: true, resultSummary: true },
  });
  if (recent.length < MAX_CONSECUTIVE_VERIFY_FAILS) return recent.length;
  // "identity verified" summaries mean a success; everything else counts as a fail.
  let consecutive = 0;
  for (const c of recent) {
    if (c.resultStatus === "ok" && c.resultSummary === "identity verified") break;
    consecutive++;
  }
  return consecutive;
}

async function forceEscalate(
  ctx: AgentCtx,
  reason: string,
): Promise<{ reply: string }> {
  const messages = await prisma.agentMessage.findMany({
    where: { sessionId: ctx.sessionId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const transcript = messages.reverse().map((m) => `[${m.role}] ${m.text}`).join("\n");
  await prisma.supportTicket.create({
    data: { sessionId: ctx.sessionId, contactId: ctx.contactId, reason, transcript },
  });
  if (ctx.channel === "chat") {
    await prisma.agentSession
      .update({ where: { id: ctx.sessionId }, data: { mode: "human" } })
      .catch(() => {});
  }
  if (ctx.contactId) {
    await prisma.activity
      .create({
        data: {
          contactId: ctx.contactId,
          type: "chat_escalated",
          title: `AI auto-escalated: ${reason}`,
          performedBy: "ai-agent",
        },
      })
      .catch(() => {});
  }
  const reply = "Got it. I am connecting you with a specialist now. You can keep typing here and they will reply in this chat.";
  await prisma.agentMessage.create({
    data: { sessionId: ctx.sessionId, role: "assistant", text: reply },
  });
  return { reply };
}

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

  // Hard-trigger escalation when the user explicitly asks for a human.
  // Cheap regex check, runs before any Gemini call.
  if (userAsksForHuman(userText)) {
    const out = await forceEscalate(ctx, "user asked for a human");
    return { reply: out.reply };
  }

  // Hard-trigger escalation after N consecutive failed verifyIdentity attempts
  // in the session. Stops the AI from re-asking for DOB forever.
  if ((await countConsecutiveVerifyFails(ctx.sessionId)) >= MAX_CONSECUTIVE_VERIFY_FAILS) {
    const out = await forceEscalate(ctx, "verifyIdentity failed repeatedly");
    return { reply: out.reply };
  }

  const history = await loadHistory(ctx.sessionId);
  let currentAuth: AuthLevel = ctx.authLevel;
  let totalCostCents = 0;
  let reply = "";
  let lastTokensIn = 0;
  let lastTokensOut = 0;
  const contactSummary = await buildContactSummary(ctx);

  let knowledge: Array<{ question: string; answer: string }> = [];
  try {
    const { getAnsweredKnowledge } = await import("@/lib/knowledge");
    knowledge = await getAnsweredKnowledge();
  } catch {}

  for (let iter = 0; iter < MAX_TOOL_CALLS_PER_TURN + 1; iter++) {
    const tools = listToolsForAuth(currentAuth).map(toolToGeminiDecl);
    const sys = buildSystemPrompt({ ...ctx, authLevel: currentAuth }, contactSummary, knowledge);

    const result = await callGemini(sys, history, tools);
    totalCostCents += tokensToCostCents(result.tokensIn, result.tokensOut);
    lastTokensIn = result.tokensIn;
    lastTokensOut = result.tokensOut;

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
    // Gemini expects function responses on a `user` turn (not "function" or
    // "tool"). Wrap the tool outcome so the model sees a clean output/error
    // shape rather than our internal status flags.
    const responseForModel: Record<string, unknown> =
      toolResult.status === "error"
        ? { error: toolResult.message }
        : toolResult.status === "denied_auth"
          ? { error: `Authorization required: ${toolResult.required}` }
          : toolResult.status === "denied_confirm"
            ? {
                output: {
                  needsConfirmation: true,
                  summary: toolResult.summary,
                  token: toolResult.token,
                },
              }
            : toolResult.status === "rate_limited"
              ? { error: "rate_limited" }
              : { output: toolResult.data };
    history.push({
      role: "user",
      parts: [{
        functionResponse: {
          name: result.functionCall.name,
          response: responseForModel,
        },
      }],
    });
  }

  let cappedAt: "tool_loop" | "cost" | undefined;
  if (!reply) {
    reply = "Let me create a ticket and have someone follow up.";
    cappedAt = "tool_loop";
    await prisma.supportTicket.create({
      data: { sessionId: ctx.sessionId, contactId: ctx.contactId, reason: "tool_loop", transcript: "" },
    });
    await prisma.agentSession.update({
      where: { id: ctx.sessionId },
      data: { endedAt: new Date(), endReason: "tool_loop" },
    });
  }

  await prisma.agentMessage.create({
    data: {
      sessionId: ctx.sessionId,
      role: "assistant",
      text: reply,
      tokensIn: lastTokensIn || null,
      tokensOut: lastTokensOut || null,
    },
  });
  // Use Math.ceil so a turn that cost 0.014 cents counts as 1 cent rather
  // than being lost to rounding. Slightly over-charges the session but the
  // cost cap is what actually matters, and small per-turn costs were
  // silently zeroing out before.
  await prisma.agentSession.update({
    where: { id: ctx.sessionId },
    data: { costCents: { increment: Math.max(1, Math.ceil(totalCostCents)) }, authLevel: currentAuth },
  });

  return {
    reply,
    newAuthLevel: currentAuth !== ctx.authLevel ? currentAuth : undefined,
    cappedAt,
  };
}

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: vi.fn() }));

const callGemini = vi.fn();
vi.mock("./gemini", () => ({ callGemini: (...a: unknown[]) => callGemini(...a) }));

const sessionStore = new Map<string, { id: string; costCents: number; authLevel: string; contactId?: string }>();
const messages: Array<{ id: string; sessionId: string; role: string; text: string; createdAt: Date }> = [];
const toolCalls: unknown[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    agentSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => sessionStore.get(where.id) ?? null),
      upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: { id: string; channel: string; contactId?: string; authLevel: string } }) => {
        const existing = sessionStore.get(where.id);
        if (existing) return existing;
        const s = { id: create.id, costCents: 0, authLevel: create.authLevel, contactId: create.contactId };
        sessionStore.set(where.id, s);
        return s;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ costCents: { increment: number }; authLevel: string; endedAt: Date; endReason: string }> }) => {
        const s = sessionStore.get(where.id);
        if (s) {
          if (data.authLevel) s.authLevel = data.authLevel;
          if (data.costCents && typeof data.costCents === "object" && "increment" in data.costCents) {
            s.costCents += (data.costCents as { increment: number }).increment;
          }
        }
        return s;
      }),
    },
    agentMessage: {
      findMany: vi.fn(async ({ where }: { where: { sessionId: string } }) =>
        messages.filter((m) => m.sessionId === where.sessionId)
      ),
      create: vi.fn(async ({ data }: { data: { sessionId: string; role: string; text: string } }) => {
        const m = { id: `m${messages.length}`, ...data, createdAt: new Date() };
        messages.push(m);
        return m;
      }),
    },
    agentToolCall: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        toolCalls.push(data);
        return data;
      }),
      findMany: vi.fn(async () => [] as unknown[]),
    },
    activity: {
      create: vi.fn(async () => ({ id: "a1" })),
    },
    supportTicket: {
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: "t1", ...(data as object) })),
    },
    agentError: {
      create: vi.fn(async () => ({ id: "e1" })),
    },
    contact: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

import { runTurn } from "./runTurn";

beforeEach(() => {
  callGemini.mockReset();
  sessionStore.clear();
  messages.length = 0;
  toolCalls.length = 0;
});

describe("runTurn", () => {
  it("returns a plain text reply when Gemini answers without a tool call", async () => {
    callGemini.mockResolvedValue({ text: "Hi there", tokensIn: 50, tokensOut: 5 });
    const out = await runTurn("hello", {
      channel: "chat",
      sessionId: "s1",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toBe("Hi there");
    expect(messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("runs a tool call and feeds the result back to Gemini", async () => {
    callGemini
      .mockResolvedValueOnce({
        functionCall: { name: "getLoanProducts", args: {} },
        tokensIn: 100,
        tokensOut: 10,
      })
      .mockResolvedValueOnce({ text: "We offer $100 to $10,000.", tokensIn: 120, tokensOut: 20 });

    const out = await runTurn("what do you offer", {
      channel: "chat",
      sessionId: "s2",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toContain("$100");
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(toolCalls).toHaveLength(1);
  });

  it("rejects a write tool when authLevel does not satisfy", async () => {
    callGemini
      .mockResolvedValueOnce({
        functionCall: { name: "schedulePayment", args: { amount: 100, date: "2026-06-01" } },
        tokensIn: 100,
        tokensOut: 10,
      })
      .mockResolvedValueOnce({ text: "I cannot do that until you verify.", tokensIn: 120, tokensOut: 20 });

    const out = await runTurn("schedule a payment", {
      channel: "chat",
      sessionId: "s3",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toMatch(/verify/i);
    expect(toolCalls[0]).toMatchObject({ resultStatus: "denied_auth" });
  });

  it("caps to 5 tool calls per turn", async () => {
    callGemini.mockResolvedValue({
      functionCall: { name: "getLoanProducts", args: {} },
      tokensIn: 100,
      tokensOut: 10,
    });
    const out = await runTurn("loop", {
      channel: "chat",
      sessionId: "s4",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toMatch(/let me create a ticket|escalate|come back/i);
  });

  it("force-escalates when the user asks for a human", async () => {
    const out = await runTurn("can I speak to a human", {
      channel: "chat",
      sessionId: "s-esc-1",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toMatch(/specialist|connecting/i);
    // Gemini should NOT have been called for this turn.
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("force-escalates on 'agent' keyword", async () => {
    const out = await runTurn("Agent", {
      channel: "chat",
      sessionId: "s-esc-2",
      authLevel: "anon",
      metadata: {},
    });
    expect(out.reply).toMatch(/specialist|connecting/i);
    expect(callGemini).not.toHaveBeenCalled();
  });
});

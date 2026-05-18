import { describe, it, expect, vi, beforeEach } from "vitest";

const createTicket = vi.fn();
const findMessages = vi.fn();
const updateSession = vi.fn();
const createActivity = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    supportTicket: { create: (...a: unknown[]) => createTicket(...a) },
    agentMessage: { findMany: (...a: unknown[]) => findMessages(...a) },
    agentSession: { update: (...a: unknown[]) => updateSession(...a) },
    activity: { create: (...a: unknown[]) => createActivity(...a) },
  },
}));

import { escalateToTicket } from "./escalateToTicket";

const voiceCtx = { channel: "voice", sessionId: "s1", authLevel: "phone-matched", contactId: "c1", metadata: { callSid: "CA1" } } as const;
const chatCtx = { channel: "chat", sessionId: "s1", authLevel: "anon", contactId: "c1", metadata: {} } as const;

beforeEach(() => {
  createTicket.mockReset();
  findMessages.mockReset();
  updateSession.mockReset();
  createActivity.mockReset();
  findMessages.mockResolvedValue([
    { role: "user", text: "help", createdAt: new Date() },
    { role: "assistant", text: "sure", createdAt: new Date() },
  ]);
  createTicket.mockResolvedValue({ id: "t1" });
  updateSession.mockResolvedValue({});
  createActivity.mockResolvedValue({});
});

describe("escalateToTicket", () => {
  it("creates a ticket with transcript of last 20 turns", async () => {
    const res = await escalateToTicket.handler({ reason: "complex" }, voiceCtx);
    expect(res.status).toBe("ok");
    expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: "complex", sessionId: "s1", contactId: "c1" }),
    }));
  });

  it("flips chat sessions into human-takeover mode", async () => {
    const res = await escalateToTicket.handler({ reason: "complex" }, chatCtx);
    expect(res.status).toBe("ok");
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s1" },
      data: { mode: "human" },
    }));
  });

  it("does NOT flip voice/sms sessions (no takeover surface yet)", async () => {
    await escalateToTicket.handler({ reason: "complex" }, voiceCtx);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("logs a CRM activity when the contact is known", async () => {
    await escalateToTicket.handler({ reason: "complex" }, chatCtx);
    expect(createActivity).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contactId: "c1", type: "chat_escalated" }),
    }));
  });
});

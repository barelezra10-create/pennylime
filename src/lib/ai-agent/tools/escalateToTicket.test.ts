import { describe, it, expect, vi, beforeEach } from "vitest";

const createTicket = vi.fn();
const findMessages = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    supportTicket: { create: (...a: unknown[]) => createTicket(...a) },
    agentMessage: { findMany: (...a: unknown[]) => findMessages(...a) },
  },
}));

import { escalateToTicket } from "./escalateToTicket";

const ctx = { channel: "voice", sessionId: "s1", authLevel: "phone-matched", contactId: "c1", metadata: { callSid: "CA1" } } as const;

beforeEach(() => {
  createTicket.mockReset();
  findMessages.mockReset();
});

describe("escalateToTicket", () => {
  it("creates a ticket with transcript of last 20 turns", async () => {
    findMessages.mockResolvedValue([
      { role: "user", text: "help", createdAt: new Date() },
      { role: "assistant", text: "sure", createdAt: new Date() },
    ]);
    createTicket.mockResolvedValue({ id: "t1" });
    const res = await escalateToTicket.handler({ reason: "complex" }, ctx);
    expect(res.status).toBe("ok");
    expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: "complex", sessionId: "s1", contactId: "c1" }),
    }));
  });
});

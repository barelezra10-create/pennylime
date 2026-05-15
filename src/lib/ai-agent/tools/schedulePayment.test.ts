import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
const createPayment = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findUnique: (...a: unknown[]) => findContact(...a) },
    payment: { create: (...a: unknown[]) => createPayment(...a) },
  },
}));

import { schedulePayment } from "./schedulePayment";
import { issueToken } from "../confirmation";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "verified", contactId: "c1", metadata: {} } as const;

beforeEach(() => {
  findContact.mockReset();
  createPayment.mockReset();
});

describe("schedulePayment", () => {
  it("returns denied_confirm without a token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1" } });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20" }, ctx);
    expect(res.status).toBe("denied_confirm");
  });
  it("executes with a valid token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [{ paymentNumber: 3 }] } });
    createPayment.mockResolvedValue({ id: "p1" });
    const token = issueToken("s1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20", confirm: token }, ctx);
    expect(res.status).toBe("ok");
    expect(createPayment).toHaveBeenCalled();
  });
  it("rejects invalid token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [] } });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20", confirm: "bogus.token" }, ctx);
    expect(res.status).toBe("denied_confirm");
  });
});

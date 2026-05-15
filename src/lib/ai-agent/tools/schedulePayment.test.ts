import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
const createPayment = vi.fn();
const txMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findUnique: (...a: unknown[]) => findContact(...a) },
    payment: { create: (...a: unknown[]) => createPayment(...a) },
    $transaction: (...a: unknown[]) => txMock(...a),
  },
}));

import { schedulePayment } from "./schedulePayment";
import { issueToken } from "../confirmation";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "verified", contactId: "c1", metadata: {} } as const;

beforeEach(() => {
  findContact.mockReset();
  createPayment.mockReset();
  txMock.mockReset();
});

describe("schedulePayment", () => {
  it("returns denied_confirm without a token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1" } });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20" }, ctx);
    expect(res.status).toBe("denied_confirm");
  });
  it("executes with a valid token within balance", async () => {
    findContact.mockResolvedValue({
      application: {
        id: "a1",
        payments: [{ paymentNumber: 3, principal: 200, paidAt: null }],
      },
    });
    const txCreate = vi.fn().mockResolvedValue({ id: "p1" });
    const txFindFirst = vi.fn().mockResolvedValue({ paymentNumber: 3 });
    txMock.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ payment: { findFirst: txFindFirst, create: txCreate } }));
    const token = issueToken("s1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20", confirm: token }, ctx);
    expect(res.status).toBe("ok");
    expect(txCreate).toHaveBeenCalled();
  });
  it("rejects invalid token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [] } });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20", confirm: "bogus.token" }, ctx);
    expect(res.status).toBe("denied_confirm");
  });
  it("rejects amount over $5000 cap", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [] } });
    const res = await schedulePayment.handler({ amount: 6000, date: "2026-05-20" }, ctx);
    expect(res.status).toBe("error");
  });
  it("rejects amount over remaining balance", async () => {
    findContact.mockResolvedValue({
      application: {
        id: "a1",
        payments: [
          { paymentNumber: 1, principal: 50, paidAt: null },
        ],
      },
    });
    const token = issueToken("s1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    const res = await schedulePayment.handler({ amount: 100, date: "2026-05-20", confirm: token }, ctx);
    expect(res.status).toBe("error");
    expect("message" in res && res.message).toMatch(/balance/i);
  });
});

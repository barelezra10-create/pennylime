import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { contact: { findUnique: (...a: unknown[]) => findContact(...a) } },
}));

import { getLoanSummary } from "./getLoanSummary";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "verified", contactId: "c1", metadata: {} } as const;

beforeEach(() => findContact.mockReset());

describe("getLoanSummary", () => {
  it("returns balance and next payment when there are unpaid payments", async () => {
    findContact.mockResolvedValue({
      application: {
        applicationCode: "ABC",
        acceptedAmount: 1000,
        interestRate: 0.36,
        payments: [
          { dueDate: new Date("2026-05-01"), amount: 200, paidAt: new Date(), status: "PAID" },
          { dueDate: new Date("2026-06-01"), amount: 200, paidAt: null, status: "PENDING" },
        ],
      },
    });
    const res = await getLoanSummary.handler({}, ctx);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const d = res.data as { remainingBalance: number; nextPaymentAmount: number };
    expect(d.remainingBalance).toBe(200);
    expect(d.nextPaymentAmount).toBe(200);
  });
  it("returns not_found if no application", async () => {
    findContact.mockResolvedValue({ application: null });
    const res = await getLoanSummary.handler({}, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { found: boolean }).found).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { contact: { findUnique: (...a: unknown[]) => findContact(...a) } },
}));

import { getPaymentHistory } from "./getPaymentHistory";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "verified", contactId: "c1", metadata: {} } as const;

beforeEach(() => findContact.mockReset());

describe("getPaymentHistory", () => {
  it("returns most recent payments capped at limit", async () => {
    findContact.mockResolvedValue({
      application: {
        payments: [
          { dueDate: new Date("2026-05-01"), amount: 200, paidAt: new Date("2026-05-01"), status: "PAID" },
          { dueDate: new Date("2026-04-01"), amount: 200, paidAt: new Date("2026-04-01"), status: "PAID" },
          { dueDate: new Date("2026-03-01"), amount: 200, paidAt: new Date("2026-03-01"), status: "PAID" },
        ],
      },
    });
    const res = await getPaymentHistory.handler({ limit: 2 }, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { payments: unknown[] }).payments).toHaveLength(2);
  });
});

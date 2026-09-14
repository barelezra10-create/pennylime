import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  payment: mocks,
  application: { update: mocks.update },
} }));
vi.mock("@/lib/rules-engine", () => ({ getLoanRules: async () => ({}) }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: vi.fn() }));

import { rollOneReturnedPayment } from "./nsf-roll-service";

describe("NSF collections threshold", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.count.mockResolvedValue(0);
  });

  it.each([3, 4, 5])("handles %i missed payments at the five-miss boundary", async (misses) => {
    const rows = Array.from({ length: misses }, (_, i) => ({
      id: `payment-${i}`, paymentNumber: i + 1, dueDate: new Date("2026-09-01"),
      status: i === misses - 1 ? "RETURNED" : "REPLACED", isLateFee: false,
      amount: 50.5, principal: 40, interest: 10.5,
    }));
    mocks.findUnique.mockResolvedValue({
      ...rows[misses - 1], collectedAmount: 0, rollCount: misses - 1,
      application: { id: "advance-1", status: "LATE", paymentFrequency: "DAILY" },
    });
    mocks.findMany.mockResolvedValueOnce(rows.slice(0, -1)).mockResolvedValueOnce([
      ...rows,
      // A failed late-fee row must not advance the missed-payment count.
      { paymentNumber: 20, dueDate: new Date("2026-09-30"), status: "RETURNED", isLateFee: true },
    ]);
    const result = await rollOneReturnedPayment(`payment-${misses - 1}`, { dryRun: true });
    expect(result.status).toBe(misses < 5 ? "rolled" : "collections");
    if (result.status === "collections") expect(result.reason).toContain("5 missed payments");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { selectMissedPayments, type PaymentForSelector } from "./missed-payments";

const base = (over: Partial<PaymentForSelector>): PaymentForSelector => ({
  id: "p1",
  paymentNumber: 1,
  amount: 100,
  lateFee: 0,
  collectedAmount: 0,
  dueDate: new Date("2026-06-01"),
  status: "PENDING",
  increaseReturnReason: null,
  ...over,
});

const NOW = new Date("2026-07-01");

describe("selectMissedPayments", () => {
  it("includes FAILED, LATE, RETURNED, COLLECTIONS and overdue PENDING", () => {
    const rows = [
      base({ id: "a", status: "FAILED" }),
      base({ id: "b", status: "LATE" }),
      base({ id: "c", status: "RETURNED" }),
      base({ id: "d", status: "COLLECTIONS" }),
      base({ id: "e", status: "PENDING", dueDate: new Date("2026-06-20") }),
    ];
    expect(selectMissedPayments(rows, NOW).map((m) => m.paymentId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("excludes PAID, PROCESSING, WAIVED, CANCELED and future PENDING", () => {
    const rows = [
      base({ id: "a", status: "PAID" }),
      base({ id: "b", status: "PROCESSING" }),
      base({ id: "c", status: "WAIVED" }),
      base({ id: "d", status: "CANCELED" }),
      base({ id: "e", status: "PENDING", dueDate: new Date("2026-07-15") }),
    ];
    expect(selectMissedPayments(rows, NOW)).toEqual([]);
  });

  it("orders by dueDate ascending and computes outstanding", () => {
    const rows = [
      base({ id: "later", status: "FAILED", dueDate: new Date("2026-06-20"), amount: 100, lateFee: 15, collectedAmount: 40 }),
      base({ id: "first", status: "LATE", dueDate: new Date("2026-06-05") }),
    ];
    const out = selectMissedPayments(rows, NOW);
    expect(out.map((m) => m.paymentId)).toEqual(["first", "later"]);
    expect(out[1].outstanding).toBe(75); // 100 - 40 + 15
  });
});

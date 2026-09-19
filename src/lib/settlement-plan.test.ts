import { describe, it, expect } from "vitest";
import {
  buildSettlementPlan,
  collectionBalance,
  paymentOutstanding,
  settlementSnapshot,
  type SettlementPayment,
} from "./settlement-plan";
const now = new Date("2026-09-17T12:00:00Z");
const terms = {
  total: 100,
  count: 3,
  frequency: "WEEKLY" as const,
  firstDate: "2026-09-21",
};
const payment = (
  extra: Partial<SettlementPayment> = {},
): SettlementPayment => ({
  id: "p",
  amount: 100,
  principal: 80,
  collectedAmount: 25,
  lateFee: 10,
  status: "RETURNED",
  dueDate: new Date("2026-09-10T12:00:00Z"),
  ...extra,
});
describe("settlement ledger", () => {
  it("credits partial collections and counts unrolled returns as owed", () => {
    expect(paymentOutstanding(payment())).toBe(85);
    expect(collectionBalance([payment()], now)).toMatchObject({
      outstanding: 85,
      overdue: 85,
      daysOverdue: 7,
    });
  });
  it("never counts replaced, paid, waived, canceled or processing rows as collectible", () => {
    for (const status of [
      "REPLACED",
      "PAID",
      "WAIVED",
      "CANCELED",
      "PROCESSING",
    ])
      expect(paymentOutstanding(payment({ status }))).toBe(0);
    expect(paymentOutstanding(payment({ supersededBySettlementId: "s" }))).toBe(
      0,
    );
    expect(
      collectionBalance([payment({ status: "PROCESSING" })], now).processing,
    ).toBe(true);
  });
  it("does not call today's installments overdue in Eastern time", () => {
    expect(
      collectionBalance(
        [payment({ dueDate: new Date("2026-09-17T12:00:00Z") })],
        now,
      ).overdue,
    ).toBe(0);
  });
  it("detects financial and schedule changes regardless of query ordering", () => {
    const a = payment(),
      b = payment({ id: "b" });
    expect(settlementSnapshot([a, b])).toBe(settlementSnapshot([b, a]));
    expect(settlementSnapshot([a])).not.toBe(
      settlementSnapshot([payment({ collectedAmount: 26 })]),
    );
  });
});
describe("settlement schedule", () => {
  it("allocates every cent exactly once", () => {
    const plan = buildSettlementPlan(terms, now);
    expect(plan.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(plan.map((p) => p.date)).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
  });
  it("handles month ends without drifting into the next month", () => {
    const plan = buildSettlementPlan(
      { ...terms, firstDate: "2027-01-29", frequency: "MONTHLY" },
      now,
    );
    expect(plan.map((p) => p.date)).toEqual([
      "2027-01-29",
      "2027-03-01",
      "2027-03-29",
    ]);
  });
  it.each([
    { total: NaN },
    { total: 0 },
    { total: 1.001 },
    { count: 121 },
    { count: 0 },
    { count: 1.5 },
    { firstDate: "2026-09-17" },
    { firstDate: "2026-09-19" },
    { firstDate: "2026-02-30" },
  ])("rejects invalid terms %j", (change) => {
    expect(() => buildSettlementPlan({ ...terms, ...change }, now)).toThrow();
  });
});

it("daily settlement dates are distinct weekdays across a weekend and conserve cents", () => {
 const rows=buildSettlementPlan({...terms,frequency:"DAILY",firstDate:"2026-09-25",count:4},now);
 expect(rows.map(r=>r.date)).toEqual(["2026-09-25","2026-09-28","2026-09-29","2026-09-30"]);
 expect(rows.reduce((n,r)=>n+Math.round(r.amount*100),0)).toBe(10000);
});
it("daily settlement stays on calendar weekdays through daylight saving changes", () => {
 const rows=buildSettlementPlan({...terms,frequency:"DAILY",firstDate:"2026-10-30",count:3},now);
 expect(rows.map(r=>r.date)).toEqual(["2026-10-30","2026-11-02","2026-11-03"]);
});

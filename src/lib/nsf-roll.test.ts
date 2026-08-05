import { describe, it, expect } from "vitest";
import { computeRollPlan, nextDueDate, MAX_ROLLS } from "./nsf-roll";

const schedule = (count: number, start: Date, stepDays = 7) =>
  Array.from({ length: count }, (_, i) => ({
    paymentNumber: i + 1,
    dueDate: new Date(start.getTime() + i * stepDays * 86400000),
  }));

const failedBase = {
  id: "pay-3",
  amount: 150,
  principal: 130,
  interest: 20,
  collectedAmount: 0,
  rollCount: 0,
  isLateFee: false,
};

describe("nextDueDate", () => {
  it("adds 7 days for weekly", () => {
    const d = nextDueDate(new Date("2026-08-04"), "WEEKLY"); // Tue
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-11");
  });
  it("skips weekend for daily", () => {
    const fri = new Date("2026-08-07"); // Friday
    const d = nextDueDate(fri, "DAILY");
    expect(d.getDay()).toBe(1); // Monday
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describe("computeRollPlan", () => {
  it("appends the replacement after the last payment and a late fee one slot later", () => {
    const all = schedule(6, new Date("2026-08-04")); // last due = wk6
    const plan = computeRollPlan({ failed: failedBase, allPayments: all, frequency: "WEEKLY" });
    expect(plan.action).toBe("roll");
    if (plan.action !== "roll") return;
    // last existing dueDate is payment 6
    const lastDue = all[5].dueDate;
    expect(plan.replacement.paymentNumber).toBe(7);
    expect(plan.replacement.dueDate.getTime()).toBe(lastDue.getTime() + 7 * 86400000);
    expect(plan.replacement.amount).toBe(150);
    expect(plan.replacement.rollCount).toBe(1);
    expect(plan.replacement.rolledFromPaymentId).toBe("pay-3");
    expect(plan.lateFee).not.toBeNull();
    expect(plan.lateFee!.paymentNumber).toBe(8);
    expect(plan.lateFee!.amount).toBe(25);
    expect(plan.lateFee!.isLateFee).toBe(true);
    expect(plan.lateFee!.dueDate.getTime()).toBe(plan.replacement.dueDate.getTime() + 7 * 86400000);
  });

  it("only rolls the outstanding balance after a partial collection", () => {
    const all = schedule(4, new Date("2026-08-04"));
    const plan = computeRollPlan({
      failed: { ...failedBase, collectedAmount: 50 },
      allPayments: all,
      frequency: "WEEKLY",
    });
    if (plan.action !== "roll") throw new Error("expected roll");
    expect(plan.replacement.amount).toBe(100); // 150 - 50
    // principal/interest scaled by 100/150
    expect(plan.replacement.principal).toBeCloseTo(86.67, 2);
    expect(plan.replacement.interest).toBeCloseTo(13.33, 2);
  });

  it("escalates to collections once the roll cap is hit", () => {
    const all = schedule(6, new Date("2026-08-04"));
    const plan = computeRollPlan({
      failed: { ...failedBase, rollCount: MAX_ROLLS },
      allPayments: all,
      frequency: "WEEKLY",
    });
    expect(plan.action).toBe("collections");
  });

  it("never rolls a late-fee charge", () => {
    const all = schedule(6, new Date("2026-08-04"));
    const plan = computeRollPlan({
      failed: { ...failedBase, isLateFee: true },
      allPayments: all,
      frequency: "WEEKLY",
    });
    expect(plan.action).toBe("skip");
  });

  it("respects a zero late fee (no late-fee row)", () => {
    const all = schedule(3, new Date("2026-08-04"));
    const plan = computeRollPlan({ failed: failedBase, allPayments: all, frequency: "WEEKLY", lateFeeAmount: 0 });
    if (plan.action !== "roll") throw new Error("expected roll");
    expect(plan.lateFee).toBeNull();
  });
});

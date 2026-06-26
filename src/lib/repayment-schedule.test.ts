import { describe, it, expect } from "vitest";
import { generateRepaymentSchedule } from "./repayment-schedule";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (a: number[]) => round2(a.reduce((s, n) => s + n, 0));

// A known Monday so weekday-sensitive assertions are deterministic.
const MONDAY = new Date(2026, 6, 6); // 2026-07-06

describe("generateRepaymentSchedule — weekly", () => {
  const weekly = generateRepaymentSchedule({
    principal: 350,
    weeklyPayment: 100,
    termWeeks: 4,
    startDate: MONDAY,
    frequency: "WEEKLY",
  });

  it("creates one payment per week", () => {
    expect(weekly).toHaveLength(4);
  });

  it("spaces payments 7 days apart", () => {
    for (let i = 1; i < weekly.length; i++) {
      const days = (weekly[i].dueDate.getTime() - weekly[i - 1].dueDate.getTime()) / 86400000;
      expect(Math.round(days)).toBe(7);
    }
  });

  it("totals weeklyPayment * termWeeks", () => {
    expect(sum(weekly.map((p) => p.amount))).toBe(400);
  });

  it("snaps the first due date to preferredChargeDay", () => {
    const friday = 5;
    const s = generateRepaymentSchedule({
      principal: 350, weeklyPayment: 100, termWeeks: 4, startDate: MONDAY,
      frequency: "WEEKLY", preferredChargeDay: friday,
    });
    expect(s[0].dueDate.getDay()).toBe(friday);
  });
});

describe("generateRepaymentSchedule — daily (business days)", () => {
  const daily = generateRepaymentSchedule({
    principal: 350,
    weeklyPayment: 100,
    termWeeks: 4,
    startDate: MONDAY,
    frequency: "DAILY",
  });

  it("creates termWeeks * 5 business-day payments", () => {
    expect(daily).toHaveLength(20);
  });

  it("never schedules a debit on a weekend", () => {
    for (const p of daily) {
      const dow = p.dueDate.getDay();
      expect(dow).not.toBe(0); // Sunday
      expect(dow).not.toBe(6); // Saturday
    }
  });

  it("totals exactly the same as the weekly plan (same total, different frequency)", () => {
    expect(sum(daily.map((p) => p.amount))).toBe(400);
  });

  it("steps one business day at a time", () => {
    for (let i = 1; i < daily.length; i++) {
      const days = (daily[i].dueDate.getTime() - daily[i - 1].dueDate.getTime()) / 86400000;
      // 1 day on weekdays, 3 days across a weekend (Fri -> Mon).
      expect([1, 3]).toContain(Math.round(days));
    }
  });

  it("keeps principal + interest consistent and totals principal to the financed amount", () => {
    expect(sum(daily.map((p) => p.principal))).toBe(350);
    for (const p of daily) {
      expect(round2(p.principal + p.interest)).toBe(p.amount);
    }
  });
});

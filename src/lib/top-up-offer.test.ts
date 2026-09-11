import { describe, expect, it } from "vitest";
import { buildTopUpTerm, topUpSourceData, TOP_UP_SOURCE_FIELDS } from "./top-up-offer";
import { generateRepaymentSchedule } from "./repayment-schedule";

describe("top-up pricing", () => {
  it("reconciles displayed debt with every payment in the signing schedule", () => {
    const term = buildTopUpTerm({ amount: 1400, weeklyRate: 6, durationWeeks: 16 }, 1400);
    const schedule = generateRepaymentSchedule({ principal: term.disbursedAmount, weeklyPayment: term.weeklyRemittance, termWeeks: term.durationWeeks, frequency: "WEEKLY", startDate: new Date("2026-09-12") });
    expect(schedule).toHaveLength(16);
    expect(Math.round(schedule.reduce((sum, p) => sum + p.amount, 0) * 100)).toBe(Math.round((1400 + term.totalCostOfCapital) * 100));
    expect(term.weeklyRemittance).toBe(222.28);
  });
  it.each([
    { amount: 1401, weeklyRate: 6, durationWeeks: 16 },
    { amount: -1, weeklyRate: 6, durationWeeks: 16 },
    { amount: 1.001, weeklyRate: 6, durationWeeks: 16 },
    { amount: NaN, weeklyRate: 6, durationWeeks: 16 },
    { amount: 1400, weeklyRate: Infinity, durationWeeks: 16 },
    { amount: 1400, weeklyRate: -1, durationWeeks: 16 },
    { amount: 1400, weeklyRate: 6, durationWeeks: 0 },
    { amount: 1400, weeklyRate: 6, durationWeeks: 2.5 },
    { amount: 1400, weeklyRate: 6, durationWeeks: 53 },
  ])("rejects invalid financial inputs %j", input => expect(() => buildTopUpTerm(input, 1400)).toThrow());
  it("allows an explicitly entered zero rate", () => expect(buildTopUpTerm({ amount: 1400, weeklyRate: 0, durationWeeks: 4 }, 1400).totalCostOfCapital).toBe(0));
  it("copies identity/bank data but never inherits signatures or disbursement records", () => {
    const source = { ...Object.fromEntries(TOP_UP_SOURCE_FIELDS.map(key => [key, `source-${key}`])), id: "parent", offerStatus: "ACCEPTED", offerToken: "signed-token", goachDisburseUuid: "paid", goachCreditsJson: "credits", fundedAt: "yesterday", acceptedAt: "yesterday", payments: [1], documents: [2] };
    const copied = topUpSourceData(source as unknown as Record<(typeof TOP_UP_SOURCE_FIELDS)[number], unknown>);
    expect(copied.plaidAccountId).toBe("source-plaidAccountId");
    for (const field of ["id", "offerStatus", "offerToken", "goachDisburseUuid", "goachCreditsJson", "fundedAt", "acceptedAt", "payments", "documents"]) expect(copied).not.toHaveProperty(field);
  });
});

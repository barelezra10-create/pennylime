import { describe, it, expect } from "vitest";
import { computeUnderwritingSignals, evaluateSignals, DEFAULT_THRESHOLDS } from "./underwriting-signals";

const pnl = (revByMonth: number[], debtTotal = 0) =>
  JSON.stringify({
    months: revByMonth.map((_, i) => `2026-0${i + 1}`),
    revenueSource: "Uber",
    revenueByMonth: revByMonth.map((amount, i) => ({ month: `2026-0${i + 1}`, amount })),
    expenseCategories: debtTotal
      ? [{ category: "Loan & Debt Payments", total: debtTotal, byMonth: [] }]
      : [],
    expenseTotalByMonth: [],
    netByMonth: [],
    totalRevenue: revByMonth.reduce((s, x) => s + x, 0),
    totalExpenses: debtTotal,
    netTotal: 0,
  });

const breakdown = (listedMatched: boolean) =>
  JSON.stringify({
    months: ["2026-01"],
    platforms: [{ platform: "Uber", isListed: listedMatched, total: listedMatched ? 3000 : 0, byMonth: [] }],
    grandTotal: 3000,
  });

const noPrior = { advances: 0, defaults: 0, nsf: 0, paidOff: 0 };

describe("computeUnderwritingSignals", () => {
  it("derives debt-to-income from the P&L Loan & Debt Payments row", () => {
    const s = computeUnderwritingSignals({
      monthlyIncome: 2000,
      nsfCount90d: 0,
      daysNegative90d: 0,
      minBalance90d: 100,
      lastDepositAt: new Date("2026-08-01"),
      incomeByPlatformJson: breakdown(true),
      monthlyPnlJson: pnl([2000, 2000, 2000], 3000), // $3000 debt over 3 months = $1000/mo
      platform: "uber",
      prior: noPrior,
      now: new Date("2026-08-05"),
    });
    expect(s.monthlyDebtService).toBe(1000);
    expect(s.debtToIncome).toBe(0.5);
    expect(s.platformMatch).toBe("matched");
    expect(s.incomeVolatility).toBe(0); // flat income
    expect(s.daysSinceLastDeposit).toBe(4);
  });

  it("flags stale income and unmatched platform", () => {
    const s = computeUnderwritingSignals({
      monthlyIncome: 2000,
      nsfCount90d: 0,
      daysNegative90d: 0,
      minBalance90d: 100,
      lastDepositAt: new Date("2026-07-01"),
      incomeByPlatformJson: breakdown(false),
      monthlyPnlJson: pnl([1000, 3000, 500]),
      platform: "uber",
      prior: noPrior,
      now: new Date("2026-08-05"),
    });
    expect(s.platformMatch).toBe("unmatched");
    expect(s.daysSinceLastDeposit).toBe(35);
    expect(s.incomeVolatility! > 0.5).toBe(true); // spiky
  });
});

describe("evaluateSignals", () => {
  const base = {
    nsfCount: 0, daysNegative: 0, minBalance: 100, monthlyDebtService: 0, debtToIncome: 0,
    incomeVolatility: 0, daysSinceLastDeposit: 3, platformMatch: "matched" as const, prior: noPrior,
  };

  it("approves a clean profile", () => {
    expect(evaluateSignals(base).verdict).toBe("APPROVE");
  });
  it("rejects on prior default", () => {
    const r = evaluateSignals({ ...base, prior: { advances: 1, defaults: 1, nsf: 0, paidOff: 0 } });
    expect(r.verdict).toBe("REJECT");
  });
  it("rejects on heavy NSF, reviews on moderate NSF", () => {
    expect(evaluateSignals({ ...base, nsfCount: DEFAULT_THRESHOLDS.nsfHard }).verdict).toBe("REJECT");
    expect(evaluateSignals({ ...base, nsfCount: DEFAULT_THRESHOLDS.nsfSoft }).verdict).toBe("MANUAL_REVIEW");
  });
  it("reviews on high debt load / unmatched platform / stale income / negative balance", () => {
    expect(evaluateSignals({ ...base, debtToIncome: 0.7 }).verdict).toBe("MANUAL_REVIEW");
    expect(evaluateSignals({ ...base, platformMatch: "unmatched" }).verdict).toBe("MANUAL_REVIEW");
    expect(evaluateSignals({ ...base, daysSinceLastDeposit: 40 }).verdict).toBe("MANUAL_REVIEW");
    expect(evaluateSignals({ ...base, minBalance: -50 }).verdict).toBe("MANUAL_REVIEW");
  });
});

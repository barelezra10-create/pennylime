import type { MonthlyPL } from "@/lib/monthly-pl";
import type { IncomeByPlatform } from "@/lib/income-by-platform";

// Prior-borrower repayment history (strongest predictor we have — our own data).
export type PriorPerformance = {
  advances: number; // count of prior applications that were funded / active / closed
  defaults: number; // prior advances that hit COLLECTIONS or DEFAULTED
  nsf: number; // prior payments that returned NSF / failed
  paidOff: number; // prior advances paid off cleanly
};

export type PlatformMatch = "matched" | "unmatched" | "none-listed" | "unknown";

export type UnderwritingSignals = {
  nsfCount: number | null; // NSF/overdraft fees in the 90-day statements
  daysNegative: number | null;
  minBalance: number | null;
  monthlyDebtService: number | null; // avg monthly "Loan & Debt Payments"
  debtToIncome: number | null; // monthlyDebtService / monthlyIncome
  incomeVolatility: number | null; // coefficient of variation of monthly income (0 = flat)
  daysSinceLastDeposit: number | null;
  platformMatch: PlatformMatch; // did their statements show income from the platform they listed?
  prior: PriorPerformance;
};

// Tunable thresholds (overridable via loanRules).
export type SignalThresholds = {
  nsfSoft: number; // >= this many NSF fees -> flag for review
  nsfHard: number; // >= this many -> decline
  maxDebtToIncome: number; // debt-service / income above this -> flag
  maxVolatility: number; // income CV above this -> flag (spiky income)
  maxIncomeGapDays: number; // no gig deposit in this many days -> flag (stopped earning)
};

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  nsfSoft: 3,
  nsfHard: 6,
  maxDebtToIncome: 0.5,
  maxVolatility: 0.7,
  maxIncomeGapDays: 21,
};

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function coefficientOfVariation(values: number[]): number | null {
  const v = values.filter((x) => x > 0);
  if (v.length < 2) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  if (mean <= 0) return null;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Derive the underwriting risk signals for an application from data we already
 * have — the statement-parsed NSF/balance fields, the income-by-platform and
 * monthly-P&L JSON, the listed platform, and the borrower's prior repayment
 * history. Pure: no DB access (caller passes `prior`).
 */
export function computeUnderwritingSignals(input: {
  monthlyIncome: number | null;
  nsfCount90d: number | null;
  daysNegative90d: number | null;
  minBalance90d: number | null;
  lastDepositAt: Date | null;
  incomeByPlatformJson: string | null;
  monthlyPnlJson: string | null;
  platform: string | null;
  prior: PriorPerformance;
  now?: Date;
}): UnderwritingSignals {
  const now = input.now ?? new Date();
  const pnl = parse<MonthlyPL>(input.monthlyPnlJson);
  const breakdown = parse<IncomeByPlatform>(input.incomeByPlatformJson);

  // #3 Debt load — avg monthly "Loan & Debt Payments" from the P&L.
  let monthlyDebtService: number | null = null;
  if (pnl) {
    const debtRow = pnl.expenseCategories.find((c) => c.category === "Loan & Debt Payments");
    const months = Math.max(1, pnl.months.length);
    monthlyDebtService = debtRow ? Math.round((debtRow.total / months) * 100) / 100 : 0;
  }
  const debtToIncome =
    monthlyDebtService != null && input.monthlyIncome && input.monthlyIncome > 0
      ? Math.round((monthlyDebtService / input.monthlyIncome) * 100) / 100
      : null;

  // #4 Income stability — coefficient of variation of monthly (listed) revenue.
  const monthlyRevenues = pnl ? pnl.revenueByMonth.map((m) => m.amount) : [];
  const incomeVolatility = coefficientOfVariation(monthlyRevenues);

  // #4 Recency — how long since their last gig deposit.
  const daysSinceLastDeposit = input.lastDepositAt
    ? Math.floor((now.getTime() - new Date(input.lastDepositAt).getTime()) / 86400000)
    : null;

  // #5 Declared-vs-actual platform match.
  let platformMatch: PlatformMatch = "unknown";
  const hasListed = Boolean((input.platform || "").trim());
  if (!hasListed) {
    platformMatch = "none-listed";
  } else if (breakdown) {
    platformMatch = breakdown.platforms.some((p) => p.isListed && p.total > 0) ? "matched" : "unmatched";
  }

  return {
    nsfCount: input.nsfCount90d ?? null,
    daysNegative: input.daysNegative90d ?? null,
    minBalance: input.minBalance90d ?? null,
    monthlyDebtService,
    debtToIncome,
    incomeVolatility: incomeVolatility == null ? null : Math.round(incomeVolatility * 100) / 100,
    daysSinceLastDeposit,
    platformMatch,
    prior: input.prior,
  };
}

/**
 * Turn signals into underwriting outcomes: human-readable reasons plus the
 * worst recommendation they imply ("REJECT" | "MANUAL_REVIEW" | "APPROVE").
 */
export function evaluateSignals(
  s: UnderwritingSignals,
  t: SignalThresholds = DEFAULT_THRESHOLDS,
): { verdict: "APPROVE" | "MANUAL_REVIEW" | "REJECT"; reasons: string[] } {
  const reasons: string[] = [];
  let verdict: "APPROVE" | "MANUAL_REVIEW" | "REJECT" = "APPROVE";
  const worse = (v: "APPROVE" | "MANUAL_REVIEW" | "REJECT") => {
    const order = { APPROVE: 0, MANUAL_REVIEW: 1, REJECT: 2 } as const;
    if (order[v] > order[verdict]) verdict = v;
  };

  // #6 Prior performance — our own repayment data is the strongest signal.
  if (s.prior.defaults > 0) {
    worse("REJECT");
    reasons.push(`Prior advance went to collections/default (${s.prior.defaults})`);
  } else if (s.prior.nsf > 0) {
    worse("MANUAL_REVIEW");
    reasons.push(`${s.prior.nsf} returned payment(s) on a prior advance`);
  } else if (s.prior.paidOff > 0) {
    reasons.push(`Repeat borrower — ${s.prior.paidOff} prior advance(s) paid off cleanly`);
  }

  // #2 NSF / overdraft history.
  if (s.nsfCount != null) {
    if (s.nsfCount >= t.nsfHard) {
      worse("REJECT");
      reasons.push(`${s.nsfCount} NSF/overdraft fees in the last 90 days`);
    } else if (s.nsfCount >= t.nsfSoft) {
      worse("MANUAL_REVIEW");
      reasons.push(`${s.nsfCount} NSF/overdraft fees in the last 90 days`);
    }
  }
  if (s.minBalance != null && s.minBalance < 0) {
    worse("MANUAL_REVIEW");
    reasons.push(`Account went negative (low balance $${Math.round(s.minBalance)})`);
  }

  // #3 Debt load.
  if (s.debtToIncome != null && s.debtToIncome > t.maxDebtToIncome) {
    worse("MANUAL_REVIEW");
    reasons.push(
      `High existing debt load — ${Math.round(s.debtToIncome * 100)}% of income goes to loan/debt payments`,
    );
  }

  // #4 Income stability + recency.
  if (s.incomeVolatility != null && s.incomeVolatility > t.maxVolatility) {
    worse("MANUAL_REVIEW");
    reasons.push(`Income is volatile month to month (not steady)`);
  }
  if (s.daysSinceLastDeposit != null && s.daysSinceLastDeposit > t.maxIncomeGapDays) {
    worse("MANUAL_REVIEW");
    reasons.push(`No gig deposit in ${s.daysSinceLastDeposit} days — may have stopped earning`);
  }

  // #5 Declared platform vs actual income.
  if (s.platformMatch === "unmatched") {
    worse("MANUAL_REVIEW");
    reasons.push(`No income found from the platform the applicant listed`);
  }

  return { verdict, reasons };
}

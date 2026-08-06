import { prisma } from "@/lib/db";
import { scoreApplication } from "@/lib/risk-model";
import type { ApplicationWithDocuments, RiskScoreResult } from "@/types";
import {
  computeUnderwritingSignals,
  evaluateSignals,
  DEFAULT_THRESHOLDS,
  type PriorPerformance,
  type UnderwritingSignals,
} from "@/lib/underwriting-signals";

export type ApprovalRecommendation = "APPROVE" | "REJECT" | "MANUAL_REVIEW";

export interface EvaluationResult {
  recommendation: ApprovalRecommendation;
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
  riskScore: RiskScoreResult | null;
  signals: UnderwritingSignals | null;
}

const FUNDED_STATUSES = ["FUNDED", "ACTIVE", "REPAYING", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"];

// #6 Prior-borrower repayment history — matched by SSN hash (strongest) then email.
async function getPriorPerformance(application: { id: string; ssnHash?: string | null; email?: string | null }): Promise<PriorPerformance> {
  const or: Array<Record<string, unknown>> = [];
  if (application.ssnHash) or.push({ ssnHash: application.ssnHash });
  if (application.email) or.push({ email: { equals: application.email, mode: "insensitive" } });
  if (or.length === 0) return { advances: 0, defaults: 0, nsf: 0, paidOff: 0 };

  const priors = await prisma.application.findMany({
    where: { OR: or, id: { not: application.id }, status: { in: FUNDED_STATUSES } },
    select: { status: true, payments: { select: { status: true } } },
  });
  const perf: PriorPerformance = { advances: priors.length, defaults: 0, nsf: 0, paidOff: 0 };
  for (const p of priors) {
    if (p.status === "COLLECTIONS" || p.status === "DEFAULTED") perf.defaults++;
    if (p.status === "PAID_OFF") perf.paidOff++;
    perf.nsf += p.payments.filter(
      (pay) => pay.status === "RETURNED" || pay.status === "FAILED" || pay.status === "REPLACED",
    ).length;
  }
  return perf;
}

export async function getLoanRules(): Promise<Record<string, string>> {
  const rules = await prisma.loanRule.findMany();
  return Object.fromEntries(rules.map((r) => [r.key, r.value]));
}

export async function evaluateApplication(
  application: ApplicationWithDocuments & { id: string }
): Promise<EvaluationResult> {
  const rules = await getLoanRules();
  const reasons: string[] = [];
  let recommendation: ApprovalRecommendation = "APPROVE";

  const loanAmount = Number(application.loanAmount);
  const loanLimit = Number(rules.loan_limit || "10000");
  const minLoan = Number(rules.min_loan || "100");
  // Affordability bar: monthly income must be ≥ advance × min_income_ratio.
  // Default 0.5 → a $1,000 advance needs ≥ $500/mo income. This replaces
  // the old "income over loan term ≥ 2× advance" math, which was wildly
  // strict on short 4-week terms (would have required ~2.16× monthly
  // income just to clear the bar) and was rejecting profiles we'd
  // actually want to approve.
  const minIncomeRatio = Number(rules.min_income_ratio || "0.5");
  // Term is stored in WEEKS in the loanTermMonths column (legacy field
  // name from the old monthly model — kept to avoid a migration). Read
  // the new max_term_weeks rule first, fall back to the legacy key.
  const maxTermWeeks = Number(rules.max_term_weeks || rules.max_loan_term_months || "16");

  // Check advance amount limits
  if (loanAmount > loanLimit) {
    recommendation = "REJECT";
    reasons.push(`Advance amount $${loanAmount} exceeds limit of $${loanLimit}`);
  }
  if (loanAmount < minLoan) {
    recommendation = "REJECT";
    reasons.push(`Advance amount $${loanAmount} below minimum of $${minLoan}`);
  }

  // Check advance term
  const loanTermWeeks = application.loanTermMonths || 6;
  if (loanTermWeeks > maxTermWeeks) {
    recommendation = "REJECT";
    reasons.push(`Term ${loanTermWeeks} weeks exceeds maximum of ${maxTermWeeks} weeks`);
  }

  // Income verification + affordability check.
  const monthlyIncome = application.monthlyIncome ? Number(application.monthlyIncome) : null;

  if (!monthlyIncome) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Income not yet verified via Plaid");
  } else {
    const requiredMonthlyIncome = minIncomeRatio * loanAmount;
    if (monthlyIncome < requiredMonthlyIncome) {
      recommendation = "REJECT";
      reasons.push(
        `Monthly income ($${monthlyIncome.toFixed(0)}) below ${minIncomeRatio}× advance ($${requiredMonthlyIncome.toFixed(0)})`
      );
    }
  }

  // Check Plaid bank connection
  if (!application.plaidAccessToken) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Bank account not linked via Plaid");
  }

  // Check duplicate SSN
  if (application.ssnHash) {
    const duplicates = await prisma.application.count({
      where: {
        ssnHash: application.ssnHash,
        id: { not: application.id },
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (duplicates > 0) {
      recommendation = "REJECT";
      reasons.push("Another application with this SSN is already in progress");
    }
  }

  // Underwriting risk signals (NSF history, debt load, income stability +
  // recency, declared-platform match, prior repayment history). Adds reasons
  // and can push the recommendation to MANUAL_REVIEW / REJECT.
  let signals: UnderwritingSignals | null = null;
  try {
    const prior = await getPriorPerformance(application);
    signals = computeUnderwritingSignals({
      monthlyIncome,
      nsfCount90d: application.nsfCount90d ?? null,
      daysNegative90d: application.daysNegative90d ?? null,
      minBalance90d: application.minBalance90d != null ? Number(application.minBalance90d) : null,
      lastDepositAt: application.lastDepositAt ?? null,
      incomeByPlatformJson: application.incomeByPlatformJson ?? null,
      monthlyPnlJson: application.monthlyPnlJson ?? null,
      platform: application.platform ?? null,
      prior,
    });
    const thresholds = {
      nsfSoft: Number(rules.nsf_soft || DEFAULT_THRESHOLDS.nsfSoft),
      nsfHard: Number(rules.nsf_hard || DEFAULT_THRESHOLDS.nsfHard),
      maxDebtToIncome: Number(rules.max_debt_to_income || DEFAULT_THRESHOLDS.maxDebtToIncome),
      maxVolatility: Number(rules.max_income_volatility || DEFAULT_THRESHOLDS.maxVolatility),
      maxIncomeGapDays: Number(rules.max_income_gap_days || DEFAULT_THRESHOLDS.maxIncomeGapDays),
    };
    const sig = evaluateSignals(signals, thresholds);
    for (const r of sig.reasons) reasons.push(r);
    if (sig.verdict === "REJECT") recommendation = "REJECT";
    else if (sig.verdict === "MANUAL_REVIEW" && recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
  } catch (err) {
    console.warn("Underwriting signals failed:", err);
  }

  if (reasons.length === 0) {
    reasons.push("All checks passed");
  }

  // Score via risk model (or fallback to min weekly rate)
  const minWeeklyRate = Number(rules.min_weekly_rate || "4");
  let suggestedRate = minWeeklyRate;
  let riskScoreResult: RiskScoreResult | null = null;
  try {
    riskScoreResult = await scoreApplication(application.id);
    suggestedRate = riskScoreResult.interestRate;
  } catch (error) {
    console.warn("Risk model scoring failed, using min_weekly_rate:", error);
  }

  return {
    recommendation,
    reasons,
    suggestedRate,
    rules,
    riskScore: riskScoreResult,
    signals,
  };
}

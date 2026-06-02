import { prisma } from "@/lib/db";
import { scoreApplication } from "@/lib/risk-model";
import type { ApplicationWithDocuments, RiskScoreResult } from "@/types";

export type ApprovalRecommendation = "APPROVE" | "REJECT" | "MANUAL_REVIEW";

export interface EvaluationResult {
  recommendation: ApprovalRecommendation;
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
  riskScore: RiskScoreResult | null;
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
  };
}

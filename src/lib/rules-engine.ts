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
  const incomeMultiplier = Number(rules.income_multiplier_ratio || "2.0");
  const minBankBalance = Number(rules.min_bank_balance || "200");
  const requiredPayStubs = Number(rules.required_pay_stubs || "3");
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

  // Check income verification. Expected income over the term =
  // monthlyIncome × (weeks / 4.33). Must be ≥ incomeMultiplier × advance.
  const monthlyIncome = application.monthlyIncome ? Number(application.monthlyIncome) : null;

  if (!monthlyIncome) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Income not yet verified via Plaid");
  } else {
    const totalIncomeOverTerm = monthlyIncome * (loanTermWeeks / 4.33);
    const requiredIncome = incomeMultiplier * loanAmount;
    if (totalIncomeOverTerm < requiredIncome) {
      recommendation = "REJECT";
      reasons.push(
        `Income over term ($${totalIncomeOverTerm.toFixed(0)}) < ${incomeMultiplier}× advance ($${requiredIncome.toFixed(0)})`
      );
    }
  }

  // Check documents
  if (application.documents.length < requiredPayStubs) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push(
      `Only ${application.documents.length} documents uploaded, ${requiredPayStubs} required`
    );
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

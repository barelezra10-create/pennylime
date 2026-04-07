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
  const minInterestRate = Number(rules.min_interest_rate || "30");
  const maxTermMonths = Number(rules.max_loan_term_months || "18");

  // Check loan amount limits
  if (loanAmount > loanLimit) {
    recommendation = "REJECT";
    reasons.push(`Loan amount $${loanAmount} exceeds limit of $${loanLimit}`);
  }
  if (loanAmount < minLoan) {
    recommendation = "REJECT";
    reasons.push(`Loan amount $${loanAmount} below minimum of $${minLoan}`);
  }

  // Check loan term
  const loanTermMonths = application.loanTermMonths || 6;
  if (loanTermMonths > maxTermMonths) {
    recommendation = "REJECT";
    reasons.push(`Loan term ${loanTermMonths} months exceeds maximum of ${maxTermMonths} months`);
  }

  // Check income verification
  const monthlyIncome = application.monthlyIncome ? Number(application.monthlyIncome) : null;

  if (!monthlyIncome) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Income not yet verified via Plaid");
  } else {
    const totalIncomeOverTerm = monthlyIncome * loanTermMonths;
    const requiredIncome = incomeMultiplier * loanAmount;
    if (totalIncomeOverTerm < requiredIncome) {
      recommendation = "REJECT";
      reasons.push(
        `Income over term ($${totalIncomeOverTerm.toFixed(0)}) < ${incomeMultiplier}x loan ($${requiredIncome.toFixed(0)})`
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

  // Score via risk model (or fallback to min rate)
  let suggestedRate = minInterestRate;
  let riskScoreResult: RiskScoreResult | null = null;
  try {
    riskScoreResult = await scoreApplication(application.id);
    suggestedRate = riskScoreResult.interestRate;
  } catch (error) {
    console.warn("Risk model scoring failed, using min_interest_rate:", error);
  }

  return {
    recommendation,
    reasons,
    suggestedRate,
    rules,
    riskScore: riskScoreResult,
  };
}

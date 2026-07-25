import type { ParsedDeposit, ParsedExpense } from "@/lib/bank-statement-parser";
import { incomeByPlatform } from "@/lib/income-by-platform";

// Gates for the apply funnel's bank-statement step.
export const MIN_COVERAGE_DAYS = 75; // must span ~the last 90 days (slack for month boundaries)
export const MIN_MONTHLY_INCOME = 1500; // minimum monthly income on the listed platform to qualify

export type StatementGateResult =
  | { ok: true }
  | { ok: false; reason: "coverage" | "income"; message: string; coverageDays?: number; monthly?: number };

/**
 * Evaluate whether parsed statements clear the funnel's two hard gates:
 *   1. Coverage — span at least MIN_COVERAGE_DAYS (the "last 90 days").
 *   2. Income — a gig worker's income on their listed platform(s) is at least
 *      MIN_MONTHLY_INCOME per month.
 *
 * Fails OPEN (returns ok:true) whenever it cannot determine a value — no dates
 * to measure, or income indeterminate — so a real applicant is never rejected
 * on a parsing gap. Only returns ok:false on a definitive breach. Shared by the
 * client-facing /api/apply/validate-statements route and the server-side
 * submit backstop so both enforce identical rules.
 */
export function evaluateStatementGate(input: {
  deposits: ParsedDeposit[];
  expenses?: ParsedExpense[];
  platforms: string | null; // comma-separated listed platforms
  workerType: string;
}): StatementGateResult {
  const deposits = input.deposits ?? [];
  const allDates = [
    ...deposits.map((d) => d.date),
    ...(input.expenses ?? []).map((e) => e.date),
  ]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""))
    .sort();

  // 1) Coverage — only enforce when we could read dates.
  if (allDates.length >= 2) {
    const first = new Date(allDates[0]).getTime();
    const last = new Date(allDates[allDates.length - 1]).getTime();
    const coverageDays = Math.round((last - first) / 86400000);
    if (coverageDays < MIN_COVERAGE_DAYS) {
      return {
        ok: false,
        reason: "coverage",
        coverageDays,
        message: `Your statements only cover about ${coverageDays} days. Please upload bank statements that cover the full last 90 days (3 months).`,
      };
    }
  }

  // 2) Income — gig workers only (business owners are underwritten on
  //    card-processor settlements, not a gig platform).
  if (input.workerType !== "BUSINESS_OWNER") {
    const breakdown = incomeByPlatform(deposits, input.platforms || null);
    const months = Math.max(1, breakdown.months.length);
    const listed = breakdown.platforms.filter((p) => p.isListed);
    const listedTotal = listed.reduce((s, p) => s + p.total, 0);
    // If nothing attributed to a listed platform, fall back to total income so
    // an attribution miss doesn't wrongly reject someone.
    const monthly = (listed.length > 0 ? listedTotal : breakdown.grandTotal) / months;
    // Only enforce when there is measurable income to judge.
    if (breakdown.grandTotal > 0 && monthly < MIN_MONTHLY_INCOME) {
      const label = listed.length > 0 ? listed.map((p) => p.platform).join(" + ") : "your gig work";
      return {
        ok: false,
        reason: "income",
        monthly: Math.round(monthly),
        message: `Based on your statements, your income from ${label} is about $${Math.round(monthly).toLocaleString()}/month. We currently need at least $1,500/month on your platform to offer an advance.`,
      };
    }
  }

  return { ok: true };
}

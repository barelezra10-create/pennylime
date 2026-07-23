import type { ParsedExpense } from "@/lib/bank-statement-parser";
import type { IncomeByPlatform } from "@/lib/income-by-platform";

// Fixed expense taxonomy for the monthly P&L. Order here is the display order.
// Gemini tags each debit into one of these; anything it can't place lands in
// "Other". Keep this list in sync with the list in the parser's SYSTEM_PROMPT.
export const EXPENSE_CATEGORIES = [
  "Fuel / Gas",
  "Vehicle & Transport",
  "Groceries",
  "Food & Dining",
  "Housing / Rent",
  "Utilities & Phone",
  "Insurance",
  "Loan & Debt Payments",
  "Subscriptions",
  "Shopping / Retail",
  "Transfers",
  "ATM / Cash",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Normalize whatever the model returned to one of our canonical categories.
function canonicalCategory(raw: string | undefined): ExpenseCategory {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "Other";
  const exact = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === v);
  if (exact) return exact;
  // Loose keyword mapping for near-misses / synonyms.
  if (/(fuel|gas|shell|chevron|exxon|bp|gasoline|petrol)/.test(v)) return "Fuel / Gas";
  if (/(vehicle|auto|car|transport|toll|parking|uber|lyft|repair|mechanic|dmv)/.test(v)) return "Vehicle & Transport";
  if (/(grocery|groceries|supermarket|walmart|kroger|aldi|costco)/.test(v)) return "Groceries";
  if (/(food|dining|restaurant|coffee|fast food|doordash|grubhub|meal)/.test(v)) return "Food & Dining";
  if (/(housing|rent|mortgage|landlord|lease)/.test(v)) return "Housing / Rent";
  if (/(utilit|phone|electric|water|internet|cable|wireless|gas bill)/.test(v)) return "Utilities & Phone";
  if (/(insurance|geico|progressive|allstate|premium)/.test(v)) return "Insurance";
  if (/(loan|debt|advance|lender|financ|repay|installment|afterpay|affirm)/.test(v)) return "Loan & Debt Payments";
  if (/(subscription|netflix|spotify|membership|recurring)/.test(v)) return "Subscriptions";
  if (/(shopping|retail|amazon|store|purchase|merchandise)/.test(v)) return "Shopping / Retail";
  if (/(transfer|zelle|venmo|cash app|paypal|wire|xfer)/.test(v)) return "Transfers";
  if (/(atm|cash withdrawal|withdrawal)/.test(v)) return "ATM / Cash";
  return "Other";
}

export type PLMonthValue = { month: string; amount: number }; // month = "YYYY-MM"
export type PLCategoryRow = { category: ExpenseCategory; total: number; byMonth: PLMonthValue[] };
export type MonthlyPL = {
  months: string[]; // sorted "YYYY-MM"
  revenueSource: string | null; // the listed platform(s) revenue is counted from
  revenueByMonth: PLMonthValue[];
  expenseCategories: PLCategoryRow[]; // only categories with any spend, in taxonomy order
  expenseTotalByMonth: PLMonthValue[];
  netByMonth: PLMonthValue[];
  totalRevenue: number;
  totalExpenses: number;
  netTotal: number;
};

function monthOf(dateIso: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(dateIso || "");
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Build a monthly profit-and-loss from the income-by-platform breakdown and
 * categorized expenses. Revenue counts ONLY the platform the applicant listed
 * as their main income (the "listed" rows in the breakdown); if none is
 * listed/matched we fall back to all income sources so the P&L isn't empty.
 * Expenses = categorized debits. Net = revenue - expenses, per calendar month.
 */
export function buildMonthlyPL(
  breakdown: IncomeByPlatform | null,
  expenses: ParsedExpense[],
): MonthlyPL {
  const platforms = breakdown?.platforms ?? [];
  const listed = platforms.filter((p) => p.isListed);
  const revenueSources = listed.length > 0 ? listed : platforms;
  const revenueSource = listed.length > 0 ? listed.map((p) => p.platform).join(", ") : null;

  const monthSet = new Set<string>();
  const revenue: Record<string, number> = {};
  for (const p of revenueSources) {
    for (const bm of p.byMonth) {
      if (bm.amount <= 0) continue;
      monthSet.add(bm.month);
      revenue[bm.month] = (revenue[bm.month] || 0) + bm.amount;
    }
  }

  // category -> month -> amount
  const cat: Record<string, Record<string, number>> = {};
  for (const e of expenses || []) {
    const amt = Math.abs(Number(e.amount) || 0);
    if (amt <= 0) continue;
    const m = monthOf(e.date);
    if (!m) continue;
    monthSet.add(m);
    const c = canonicalCategory(e.category);
    cat[c] ??= {};
    cat[c][m] = (cat[c][m] || 0) + amt;
  }

  const months = [...monthSet].sort();

  const revenueByMonth = months.map((m) => ({ month: m, amount: revenue[m] || 0 }));

  const expenseCategories: PLCategoryRow[] = EXPENSE_CATEGORIES
    .filter((c) => cat[c])
    .map((c) => {
      const byMonth = months.map((m) => ({ month: m, amount: cat[c][m] || 0 }));
      const total = byMonth.reduce((s, x) => s + x.amount, 0);
      return { category: c, total, byMonth };
    })
    .filter((row) => row.total > 0);

  const expenseTotalByMonth = months.map((m) => ({
    month: m,
    amount: expenseCategories.reduce((s, row) => s + (row.byMonth.find((x) => x.month === m)?.amount || 0), 0),
  }));

  const netByMonth = months.map((m, i) => ({
    month: m,
    amount: (revenueByMonth[i]?.amount || 0) - (expenseTotalByMonth[i]?.amount || 0),
  }));

  const totalRevenue = revenueByMonth.reduce((s, x) => s + x.amount, 0);
  const totalExpenses = expenseTotalByMonth.reduce((s, x) => s + x.amount, 0);

  return {
    months,
    revenueSource,
    revenueByMonth,
    expenseCategories,
    expenseTotalByMonth,
    netByMonth,
    totalRevenue,
    totalExpenses,
    netTotal: totalRevenue - totalExpenses,
  };
}

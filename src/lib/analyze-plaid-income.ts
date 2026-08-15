import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { incomeByPlatform } from "@/lib/income-by-platform";
import { buildMonthlyPL } from "@/lib/monthly-pl";
import type { ParsedDeposit, ParsedExpense } from "@/lib/bank-statement-parser";

// Map Plaid's personal_finance_category onto our fixed expense taxonomy
// (see monthly-pl.ts). Prefer the detailed code for a few high-signal buckets
// (gas, groceries, rent), fall back to the primary group.
function mapPlaidExpenseCategory(pfc: { primary?: string; detailed?: string } | null | undefined): string {
  const primary = (pfc?.primary || "").toUpperCase();
  const detailed = (pfc?.detailed || "").toUpperCase();
  if (detailed.includes("ATM") || detailed.includes("CASH_ADVANCE") || detailed.includes("WITHDRAWAL")) return "ATM / Cash";
  if (detailed.includes("GAS")) return "Fuel / Gas";
  if (primary === "TRANSPORTATION") return "Vehicle & Transport";
  if (detailed.includes("GROCER")) return "Groceries";
  if (primary === "FOOD_AND_DRINK") return "Food & Dining";
  if (detailed.includes("RENT") || detailed.includes("MORTGAGE")) return "Housing / Rent";
  if (primary === "RENT_AND_UTILITIES") return "Utilities & Phone";
  if (detailed.includes("INSURANCE")) return "Insurance";
  if (primary === "LOAN_PAYMENTS") return "Loan & Debt Payments";
  if (primary === "GENERAL_MERCHANDISE") return "Shopping / Retail";
  if (primary.startsWith("TRANSFER") || primary === "BANK_TRANSFER") return "Transfers";
  return "Other";
}

/**
 * Build the income-by-platform breakdown + monthly P&L for a Plaid-connected
 * application from its 90-day transaction feed, and persist ONLY those two
 * panels. Leaves monthlyIncome/avgWeeklyIncome (derived from the Plaid asset
 * report at submit) untouched so underwriting numbers don't shift.
 *
 * This is the Plaid counterpart to analyzeAndStoreIncome, which only works for
 * applicants who uploaded PDF statements. Plaid applicants have no Document
 * rows, so the statement parser has nothing to read.
 */
export async function analyzeAndStorePlaidIncome(
  applicationId: string,
): Promise<{ ok: true; deposits: number } | { ok: false; error: string }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, platform: true, plaidAccessToken: true, plaidAccountId: true },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (!app.plaidAccessToken) return { ok: false, error: "No Plaid connection" };

  let accessToken: string;
  try {
    accessToken = decrypt(app.plaidAccessToken);
  } catch {
    return { ok: false, error: "Could not decrypt Plaid token" };
  }

  const now = new Date();
  const start = new Date(now.getTime() - 90 * 86400000);
  let txs;
  try {
    const resp = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: start.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
      options: {
        count: 500,
        ...(app.plaidAccountId ? { account_ids: [app.plaidAccountId] } : {}),
      },
    });
    txs = resp.data.transactions;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to fetch Plaid transactions" };
  }

  if (!txs.length) return { ok: false, error: "No Plaid transactions in the last 90 days" };

  // Plaid convention: amount < 0 = money IN (deposit), amount > 0 = money OUT.
  const deposits: ParsedDeposit[] = [];
  const expenses: ParsedExpense[] = [];
  for (const tx of txs) {
    const name = (tx.merchant_name || tx.name || "").trim();
    const date = tx.date; // already YYYY-MM-DD
    const pfc = tx.personal_finance_category as { primary?: string; detailed?: string } | null | undefined;
    if (tx.amount < 0) {
      const isTransfer = (pfc?.primary || "").toUpperCase().startsWith("TRANSFER_IN");
      deposits.push({
        date,
        amount: Math.abs(tx.amount),
        description: name,
        platform: name,
        classification: isTransfer ? "transfer" : "income",
      });
    } else if (tx.amount > 0) {
      expenses.push({
        date,
        amount: tx.amount,
        description: name,
        category: mapPlaidExpenseCategory(pfc),
      });
    }
  }

  const breakdown = incomeByPlatform(deposits, app.platform ?? null);
  const pnl = buildMonthlyPL(breakdown, expenses);

  await prisma.application.update({
    where: { id: app.id },
    data: {
      incomeByPlatformJson: JSON.stringify(breakdown),
      monthlyPnlJson: JSON.stringify(pnl),
    },
  });

  return { ok: true, deposits: deposits.length };
}

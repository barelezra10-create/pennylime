import type { AssetReport } from "plaid";

/** Historical views use the bank's dated snapshot; no inferred live balances. */
export function statementFromAssetReport(
  report: AssetReport, accountId: string | null, startDate: string, endDate: string,
) {
  const accounts = report.items.flatMap((item) => item.accounts);
  const account = accountId ? accounts.find((value) => value.account_id === accountId) : accounts[0];
  if (!account) throw new Error("The linked account is not present in this Asset Report.");
  const item = report.items.find((value) => value.accounts.includes(account))!;
  const asOf = item.date_last_updated || report.date_generated;
  const dailyBalances = new Map(account.historical_balances.map((value) => [value.date, value.current]));
  const transactions = account.transactions
    .filter((value) => value.date >= startDate && value.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((value) => ({
      id: value.transaction_id, date: value.date,
      name: value.original_description || value.name || value.merchant_name || "Transaction",
      merchantName: value.merchant_name ?? null, amount: value.amount,
      category: value.category?.[0] ?? null, pending: value.pending,
      // A daily balance is not a transaction-level running balance.
      balanceAfter: value.pending ? null : dailyBalances.get(value.date) ?? null,
    }));
  const totalIn = transactions.reduce((sum, value) => sum + Math.max(0, -value.amount), 0);
  const totalOut = transactions.reduce((sum, value) => sum + Math.max(0, value.amount), 0);
  return {
    transactions, currentBalance: account.balances.current,
    totalIn: Math.round(totalIn * 100) / 100, totalOut: Math.round(totalOut * 100) / 100,
    net: Math.round((totalIn - totalOut) * 100) / 100, count: transactions.length,
    asOf, daysAvailable: account.days_available, daysRequested: report.days_requested,
  };
}

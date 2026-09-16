import type { AssetReport } from "plaid";
import { describe, expect, it } from "vitest";
import { statementFromAssetReport } from "./plaid-statement";

const report = {
  date_generated: "2026-09-15T12:00:00Z", days_requested: 90,
  items: [{ date_last_updated: "2026-09-15T10:00:00Z", accounts: [{
    account_id: "selected", days_available: 80, balances: { current: -10 },
    historical_balances: [{ date: "2026-09-10", current: -30 }],
    transactions: [
      { transaction_id: "deposit", date: "2026-09-10", amount: -100, original_description: "Deposit", pending: false },
      { transaction_id: "purchase", date: "2026-09-10", amount: 20, original_description: "Purchase", pending: false },
      { transaction_id: "pending", date: "2026-09-11", amount: 5, pending: true },
      { transaction_id: "old", date: "2026-08-01", amount: 50, pending: false },
    ],
  }, { account_id: "other", transactions: [{ amount: -99999 }] }] }],
} as unknown as AssetReport;

describe("historical report statement", () => {
  it("filters the requested account and dates without including other account income", () => {
    const result = statementFromAssetReport(report, "selected", "2026-09-10", "2026-09-10");
    expect(result.count).toBe(2);
    expect(result.totalIn).toBe(100);
    expect(result.totalOut).toBe(20);
    expect(result.net).toBe(80);
    expect(result.currentBalance).toBe(-10);
    expect(result.asOf).toBe("2026-09-15T10:00:00Z");
    expect(result.daysAvailable).toBe(80);
  });
  it("uses historical end-of-day balances rather than inventing transaction balances", () => {
    const result = statementFromAssetReport(report, "selected", "2026-08-01", "2026-09-15");
    expect(result.transactions.filter((tx) => tx.date === "2026-09-10").map((tx) => tx.balanceAfter)).toEqual([-30, -30]);
    expect(result.transactions.find((tx) => tx.id === "pending")?.balanceAfter).toBeNull();
    expect(result.transactions.find((tx) => tx.id === "old")?.balanceAfter).toBeNull();
  });
  it("does not silently substitute another bank account", () => {
    expect(() => statementFromAssetReport(report, "missing", "2026-01-01", "2026-12-31")).toThrow("not present");
  });
});

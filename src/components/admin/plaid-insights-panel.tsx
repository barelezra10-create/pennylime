"use client";

import { useState } from "react";
import { toast } from "sonner";
import { fetchAndStoreIncome, getRecentTransactions, triggerPlaidAssetReport, parsePlaidAssetReportWithAI } from "@/actions/plaid";
import { TransactionStatement } from "@/components/admin/transaction-statement";

type Tx = {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  category: string | null;
  pending: boolean;
};

export type PlaidInsightsApplication = {
  id: string;
  plaidAccessToken: string | null;
  plaidLinkStale: boolean;
  monthlyIncome: number | null;
  avgWeeklyIncome: number | null;
  depositCount90d: number | null;
  largestDeposit: number | null;
  depositCadence: string | null;
  bankBalance: number | null;
  availableBalance: number | null;
  plaidInstitutionName: string | null;
  plaidAccountName: string | null;
  plaidAccountMask: string | null;
  plaidAccountSubtype: string | null;
  plaidIdentityName: string | null;
  plaidIdentityAddress: string | null;
  plaidIdentityEmail: string | null;
  plaidIdentityPhone: string | null;
  identityNeedsReview: boolean;
  lastPlaidRefresh: string | null;
  // Original form values for identity diff
  formFirstName: string;
  formLastName: string;
  formEmail: string;
  formPhone: string;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtDate = (iso: string | null) => {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const cadenceLabel: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  irregular: "Irregular",
};

export function PlaidInsightsPanel({ application }: { application: PlaidInsightsApplication }) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullingAssets, setPullingAssets] = useState(false);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [showTxs, setShowTxs] = useState(false);

  const hasConnection = !!application.plaidAccessToken;
  const hasDepositData = application.monthlyIncome != null || application.depositCount90d != null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await fetchAndStoreIncome(application.id);
      if (result.success) {
        toast.success("Plaid data refreshed");
        // Trigger server component re-render so cached fields update.
        window.location.reload();
      } else {
        toast.error(result.error || "Refresh failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePullAssets() {
    setPullingAssets(true);
    toast.message("Pulling Plaid Asset Report…", {
      description: "Plaid typically returns in 30-60s. Please wait.",
    });
    try {
      const result = await triggerPlaidAssetReport(application.id);
      if (result.success) {
        toast.success(result.message);
        window.location.reload();
      } else {
        toast.error(result.error || "Asset report failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Asset report failed");
    } finally {
      setPullingAssets(false);
    }
  }

  const [parsingAi, setParsingAi] = useState(false);
  async function handleParseWithAI() {
    setParsingAi(true);
    toast.message("Parsing Plaid Asset Report with AI…", {
      description: "Gemini reads the PDF — usually 10-30s.",
    });
    try {
      const result = await parsePlaidAssetReportWithAI(application.id);
      if (result.success) {
        toast.success(
          `Parsed: monthly income $${result.monthlyIncome.toLocaleString()}, ${result.depositCount} deposits, ${result.confidence} confidence.`,
        );
        window.location.reload();
      } else {
        toast.error(result.error || "AI parse failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI parse failed");
    } finally {
      setParsingAi(false);
    }
  }

  async function handleLoadTransactions() {
    setShowTxs(true);
    if (txs) return; // already loaded
    setLoadingTxs(true);
    try {
      const r = await getRecentTransactions(application.id);
      if (r.ok) {
        setTxs(r.transactions);
      } else {
        toast.error(r.error || "Failed to load transactions");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoadingTxs(false);
    }
  }

  if (!hasConnection) {
    return (
      <div className="bg-white rounded-[10px] p-6">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-2">Plaid Insights</h2>
        <p className="text-sm text-[#a1a1aa]">No Plaid connection on this application.</p>
      </div>
    );
  }

  // Identity field-level mismatch detection (lowercase, strip non-alphanumerics).
  const norm = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const formFullName = norm(`${application.formFirstName}${application.formLastName}`);
  const plaidName = norm(application.plaidIdentityName);
  const nameMatch = !plaidName || plaidName.includes(formFullName) || formFullName.includes(plaidName);
  const emailMatch =
    !application.plaidIdentityEmail || norm(application.plaidIdentityEmail) === norm(application.formEmail);
  const phoneMatch =
    !application.plaidIdentityPhone ||
    norm(application.plaidIdentityPhone).slice(-10) === norm(application.formPhone).slice(-10);

  return (
    <div className="bg-white rounded-[10px] p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
            <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
            Plaid Insights
          </h2>
          <p className="text-xs text-[#71717a] mt-1">
            Last refresh: {fmtDate(application.lastPlaidRefresh)}
            {application.plaidLinkStale && (
              <span className="ml-2 inline-block rounded-full bg-[#fef3c7] text-[#92400e] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Link stale
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handlePullAssets}
            disabled={pullingAssets || refreshing || parsingAi}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              hasDepositData
                ? "border border-gray-200 bg-white text-black hover:bg-gray-50"
                : "bg-[#15803d] text-white hover:bg-[#166534]"
            }`}
          >
            <svg className={`h-3.5 w-3.5 ${pullingAssets ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            {pullingAssets
              ? "Pulling…"
              : hasDepositData
              ? "Re-pull Asset Report"
              : "Pull Asset Report"}
          </button>
          <button
            onClick={handleParseWithAI}
            disabled={parsingAi || pullingAssets || refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-[#15803d]/30 bg-[#f0fdf4] text-[#15803d] px-3 py-1.5 text-xs font-semibold hover:bg-[#dcfce7] disabled:opacity-50 transition-colors"
          >
            <svg className={`h-3.5 w-3.5 ${parsingAi ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
            {parsingAi ? "Parsing…" : "Parse with AI"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || pullingAssets || parsingAi}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Top-line metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Metric label="Monthly income" value={fmt(application.monthlyIncome)} accent />
        <Metric
          label="Weekly avg"
          value={application.avgWeeklyIncome != null ? `${fmt(application.avgWeeklyIncome)}/wk` : "—"}
        />
        <Metric label="Current balance" value={fmt(application.bankBalance)} />
        <Metric
          label="Available"
          value={fmt(application.availableBalance)}
          warn={
            application.availableBalance != null && Number(application.availableBalance) < 100
          }
        />
      </div>

      {/* ── Detailed sections ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Income detail */}
        <Section title="Income">
          <Row label="Cadence" value={application.depositCadence ? cadenceLabel[application.depositCadence] || application.depositCadence : "—"} />
          <Row label="Deposits (90d)" value={application.depositCount90d?.toString() ?? "—"} />
          <Row label="Largest deposit" value={fmt(application.largestDeposit)} />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row label="Bank" value={application.plaidInstitutionName ?? "—"} />
          <Row
            label="Account"
            value={
              application.plaidAccountName
                ? `${application.plaidAccountName}${
                    application.plaidAccountMask ? ` ••${application.plaidAccountMask}` : ""
                  }`
                : "—"
            }
          />
          <Row label="Type" value={application.plaidAccountSubtype ?? "—"} />
        </Section>

        {/* Identity */}
        <Section
          title="Identity"
          headerExtra={
            application.identityNeedsReview ? (
              <span className="inline-block rounded-full bg-[#fef3c7] text-[#92400e] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Needs review
              </span>
            ) : null
          }
        >
          <Row
            label="Name"
            value={application.plaidIdentityName ?? "—"}
            mismatch={application.plaidIdentityName != null && !nameMatch}
          />
          <Row
            label="Email"
            value={application.plaidIdentityEmail ?? "—"}
            mismatch={application.plaidIdentityEmail != null && !emailMatch}
          />
          <Row
            label="Phone"
            value={application.plaidIdentityPhone ?? "—"}
            mismatch={application.plaidIdentityPhone != null && !phoneMatch}
          />
          <Row label="Address" value={application.plaidIdentityAddress ?? "—"} multiline />
        </Section>
      </div>

      {/* ── Recent transactions (lazy loaded) ── */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        {!showTxs ? (
          <button
            onClick={handleLoadTransactions}
            className="text-sm font-medium text-[#15803d] hover:text-[#166534]"
          >
            Show recent transactions →
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-black">Recent transactions</h3>
              <button
                onClick={() => setShowTxs(false)}
                className="text-xs text-[#71717a] hover:text-black"
              >
                Hide
              </button>
            </div>
            {loadingTxs ? (
              <p className="text-xs text-[#a1a1aa]">Loading…</p>
            ) : txs && txs.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-[#fafafa] text-[#71717a]">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Date</th>
                      <th className="text-left font-semibold px-3 py-2">Description</th>
                      <th className="text-left font-semibold px-3 py-2">Category</th>
                      <th className="text-right font-semibold px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => {
                      const isDeposit = tx.amount < 0;
                      return (
                        <tr key={tx.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-[#52525b] font-mono">{tx.date}</td>
                          <td className="px-3 py-2 text-black">
                            {tx.merchantName || tx.name}
                            {tx.pending && (
                              <span className="ml-2 inline-block rounded-full bg-[#f4f4f5] text-[#71717a] px-1.5 py-0.5 text-[9px] uppercase font-semibold">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#71717a]">{tx.category ?? "—"}</td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              isDeposit ? "text-[#15803d]" : "text-black"
                            }`}
                          >
                            {isDeposit ? "+" : "−"}${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-[#a1a1aa]">No transactions found.</p>
            )}
          </>
        )}
        {hasConnection && <TransactionStatement applicationId={application.id} />}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const valueColor = warn ? "text-[#dc2626]" : accent ? "text-[#15803d]" : "text-black";
  return (
    <div className="bg-[#fafafa] rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-[0.05em] text-[#71717a] font-semibold">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${valueColor}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  children,
  headerExtra,
}: {
  title: string;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold">{title}</p>
        {headerExtra}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mismatch,
  multiline,
}: {
  label: string;
  value: string;
  mismatch?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="text-xs">
      <p className="text-[#a1a1aa]">{label}</p>
      <p
        className={`font-medium ${mismatch ? "text-[#dc2626]" : "text-black"} ${multiline ? "" : "truncate"}`}
        title={value}
      >
        {value}
        {mismatch && (
          <span className="ml-1 text-[10px] uppercase tracking-wide font-semibold text-[#dc2626]">
            mismatch
          </span>
        )}
      </p>
    </div>
  );
}

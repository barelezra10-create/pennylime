"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { chargePaymentNow } from "@/actions/payments";
import { chargeAllDueToday, type AdvanceRow, type AdvancesSummary } from "@/actions/advances";
import { withdrawApplication, cancelApplication } from "@/actions/application-decision";

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const money2 = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const fmtPlatforms = (p: string) =>
  p.split(",").map((s) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase())).filter(Boolean).join(", ");
const lastPayStyle = (s: string) => {
  const base = "inline-block text-[11px] font-semibold ";
  if (s === "PAID") return base + "text-[#15803d]";
  if (s === "FAILED" || s === "RETURNED") return base + "text-[#b91c1c]";
  if (s === "PROCESSING") return base + "text-[#1d4ed8]";
  return base + "text-[#71717a]";
};

type Filter = "Pending" | "Approved" | "Active" | "Paid" | "Default" | "Rejected";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-[#f0fdf4] text-[#15803d]",
  FUNDED: "bg-[#eff6ff] text-[#1d4ed8]",
  REPAYING: "bg-[#f0fdf4] text-[#15803d]",
  LATE: "bg-[#fffbeb] text-[#b45309]",
  COLLECTIONS: "bg-[#fef2f2] text-[#b91c1c]",
  PENDING: "bg-[#f4f4f5] text-[#52525b]",
  APPLICANT: "bg-[#f4f4f5] text-[#52525b]",
  APPROVED: "bg-[#eff6ff] text-[#1d4ed8]",
  OFFER_ACCEPTED: "bg-[#eff6ff] text-[#1d4ed8]",
  DEFAULTED: "bg-[#fef2f2] text-[#b91c1c]",
  PAID_OFF: "bg-[#f0fdf4] text-[#15803d]",
};

export function AdvancesClient({
  advances,
  summary,
}: {
  advances: AdvanceRow[];
  summary: AdvancesSummary;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage");
  const filter: Filter = (["Pending", "Approved", "Active", "Paid", "Default", "Rejected"] as Filter[]).includes(stageParam as Filter)
    ? (stageParam as Filter)
    : "Active";
  const [search, setSearch] = useState("");
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  // Servicing metrics + bulk charge only make sense on funded stages.
  const showServicing = ["Active", "Paid", "Default"].includes(filter);
  const showCharge = ["Active", "Default"].includes(filter);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return advances.filter((a) => {
      if (a.stageTab !== filter) return false;
      if (q) {
        const hay = `${a.borrowerName} ${a.applicationCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [advances, filter, search]);

  async function chargeOne(a: AdvanceRow) {
    if (!a.nextPaymentId) return;
    setChargingId(a.id);
    try {
      const r = await chargePaymentNow(a.nextPaymentId);
      if (r.success) {
        toast.success(`Charged ${a.borrowerName} · ${money2(a.nextDueAmount)}`);
        router.refresh();
      } else {
        toast.error(r.error || "Charge failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Charge failed");
    } finally {
      setChargingId(null);
    }
  }

  async function chargeAll() {
    if (summary.dueTodayCount === 0) {
      toast.info("Nothing due today.");
      return;
    }
    if (!confirm(`Charge all ${summary.dueTodayCount} payments due today (${money2(summary.dueTodayAmount)})?`)) return;
    setBulkRunning(true);
    try {
      const r = await chargeAllDueToday();
      if (!r.ok) {
        toast.error(r.error || "Bulk charge failed");
      } else {
        toast.success(`Charged ${r.charged}${r.failed ? `, ${r.failed} failed` : ""}`);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk charge failed");
    } finally {
      setBulkRunning(false);
    }
  }

  async function runDecision(a: AdvanceRow, mode: "withdraw" | "cancel") {
    const label = mode === "withdraw"
      ? `Withdraw the offer for ${a.borrowerName}?`
      : `Cancel ${a.borrowerName}'s application?`;
    if (!confirm(label)) return;
    setDecidingId(a.id);
    try {
      const r = mode === "withdraw"
        ? await withdrawApplication(a.id)
        : await cancelApplication(a.id);
      if (r.ok) {
        toast.success(mode === "withdraw" ? "Offer withdrawn." : "Application cancelled.");
        router.refresh();
      } else {
        toast.error(r.error || "Action failed.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div>
      {/* Ops metrics — only on funded stages */}
      {showServicing && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric label="Money out" value={money(summary.moneyOut)} sub="principal still out" />
          <Metric label="Paid back" value={money(summary.paidBack)} sub="collected to date" accent="text-[#15803d]" />
          <Metric label="Profit" value={money(summary.profit)} sub="interest + fees earned" accent="text-[#15803d]" />
          <Metric label="Due now" value={money(summary.dueTodayAmount)} sub={`${summary.dueTodayCount} due today · ${summary.overdueCount} overdue`} accent={summary.overdueCount > 0 ? "text-[#b91c1c]" : ""} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search borrower or code"
          className="flex-1 min-w-[180px] text-xs border border-[#e4e4e7] rounded-lg px-3 py-1.5 outline-none focus:border-[#15803d]"
        />
        {showCharge && (
          <button
            onClick={chargeAll}
            disabled={bulkRunning || summary.dueTodayCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white text-xs font-semibold px-3.5 py-2 hover:bg-[#166534] disabled:opacity-50 transition-colors"
          >
            {bulkRunning ? "Charging…" : `Charge all due (${summary.dueTodayCount})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-[#e4e4e7] bg-white">
        {filter === "Pending" ? (
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa] text-[#71717a] text-left">
              <tr>
                <th className="font-semibold px-4 py-2.5">Applicant</th>
                <th className="font-semibold px-4 py-2.5">Where they work</th>
                <th className="font-semibold px-4 py-2.5 text-right">Monthly income</th>
                <th className="font-semibold px-4 py-2.5 text-right">Requested</th>
                <th className="font-semibold px-4 py-2.5 text-right">Length</th>
                <th className="font-semibold px-4 py-2.5">How they found us</th>
                <th className="font-semibold px-4 py-2.5 text-right">Plaid balance</th>
                <th className="font-semibold px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[#a1a1aa]">No pending applicants.</td></tr>
              ) : rows.map((a) => (
                <tr key={a.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-black">{a.borrowerName}</div>
                    <div className="text-[11px] font-mono text-[#a1a1aa]">{a.applicationCode}</div>
                  </td>
                  <td className="px-4 py-3 text-[#52525b]">{a.platform ? fmtPlatforms(a.platform) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.monthlyIncome != null ? money(a.monthlyIncome) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(a.requestedAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.termMonths} wks</td>
                  <td className="px-4 py-3 text-[#52525b]">{a.referral || <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.bankBalance != null ? money(a.bankBalance) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/applications/${a.id}?from=Pending`}
                      className="rounded-md border border-[#15803d] text-[#15803d] hover:bg-[#f0fdf4] text-[11px] font-semibold px-2.5 py-1 transition-colors"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : filter === "Approved" ? (
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa] text-[#71717a] text-left">
              <tr>
                <th className="font-semibold px-4 py-2.5">Applicant</th>
                <th className="font-semibold px-4 py-2.5">Where they work</th>
                <th className="font-semibold px-4 py-2.5 text-right">Monthly income</th>
                <th className="font-semibold px-4 py-2.5 text-right">Requested</th>
                <th className="font-semibold px-4 py-2.5 text-right">Approved</th>
                <th className="font-semibold px-4 py-2.5 text-right">Length</th>
                <th className="font-semibold px-4 py-2.5">How they found us</th>
                <th className="font-semibold px-4 py-2.5 text-right">Plaid balance</th>
                <th className="font-semibold px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-[#a1a1aa]">No approved applicants.</td></tr>
              ) : rows.map((a) => (
                <tr key={a.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-black">{a.borrowerName}</div>
                    <div className="text-[11px] font-mono text-[#a1a1aa]">{a.applicationCode}</div>
                  </td>
                  <td className="px-4 py-3 text-[#52525b]">{a.platform ? fmtPlatforms(a.platform) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.monthlyIncome != null ? money(a.monthlyIncome) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(a.requestedAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#15803d]">{a.approvedAmount != null ? money(a.approvedAmount) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.termMonths} wks</td>
                  <td className="px-4 py-3 text-[#52525b]">{a.referral || <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.bankBalance != null ? money(a.bankBalance) : <span className="text-[#a1a1aa]">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => runDecision(a, "withdraw")}
                        disabled={decidingId === a.id}
                        className="rounded-md border border-[#e4e4e7] text-[#52525b] hover:bg-[#fafafa] text-[11px] font-semibold px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Withdraw
                      </button>
                      <button
                        onClick={() => runDecision(a, "cancel")}
                        disabled={decidingId === a.id}
                        className="rounded-md border border-[#dc2626] text-[#dc2626] hover:bg-[#fef2f2] text-[11px] font-semibold px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Cancel
                      </button>
                      <Link
                        href={`/admin/applications/${a.id}?from=Approved`}
                        className="rounded-md border border-[#15803d] text-[#15803d] hover:bg-[#f0fdf4] text-[11px] font-semibold px-2.5 py-1 transition-colors"
                      >
                        Review
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa] text-[#71717a] text-left">
              <tr>
                <th className="font-semibold px-4 py-2.5">Customer</th>
                <th className="font-semibold px-4 py-2.5">Status</th>
                <th className="font-semibold px-4 py-2.5 text-right">Amount</th>
                <th className="font-semibold px-4 py-2.5 text-center">Paid</th>
                <th className="font-semibold px-4 py-2.5">Last payment</th>
                <th className="font-semibold px-4 py-2.5">Next payment</th>
                <th className="font-semibold px-4 py-2.5 text-right">Outstanding</th>
                <th className="font-semibold px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[#a1a1aa]">No advances match.</td></tr>
              ) : rows.map((a) => {
                const isFunded = ["Active", "Default"].includes(a.stageTab);
                const showCharge = ["Active", "Default"].includes(a.stageTab);
                return (
                <tr key={a.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-black">{a.borrowerName}</div>
                    <div className="text-[11px] font-mono text-[#a1a1aa]">{a.applicationCode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[a.status] || "bg-[#f4f4f5] text-[#71717a]"}`}>
                      {a.status}
                    </span>
                    {a.daysOverdue > 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-[#b91c1c]">{a.daysOverdue}d overdue</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {money(isFunded ? a.fundedAmount : a.requestedAmount)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-[#52525b]">
                    {a.paidCount}/{a.totalCount}
                  </td>
                  <td className="px-4 py-3">
                    {a.lastResult ? <span className={lastPayStyle(a.lastResult)}>{a.lastResult}</span> : <span className="text-[#a1a1aa]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {a.nextPaymentId ? (
                      <>
                        <span className="font-semibold text-black tabular-nums">{money2(a.nextDueAmount)}</span>
                        <span className="text-[#a1a1aa]"> · {fmtDate(a.nextDueDate)}</span>
                      </>
                    ) : (
                      <span className="text-[#a1a1aa]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {isFunded && a.outstanding > 0 ? money2(a.outstanding) : <span className="text-[#a1a1aa]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {showCharge && (
                        <button
                          onClick={() => chargeOne(a)}
                          disabled={!a.nextPaymentId || a.isProcessing || chargingId === a.id}
                          className="rounded-md border border-[#15803d] text-[#15803d] hover:bg-[#f0fdf4] text-[11px] font-semibold px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {chargingId === a.id ? "…" : "Charge now"}
                        </button>
                      )}
                      <Link
                        href={`/admin/applications/${a.id}?from=Active`}
                        className="rounded-md border border-[#e4e4e7] text-[#52525b] hover:bg-[#fafafa] text-[11px] font-semibold px-2.5 py-1 transition-colors"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">{label}</p>
      <p className={`text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-none ${accent || "text-black"}`}>{value}</p>
      <p className="text-[11px] text-[#a1a1aa] mt-2">{sub}</p>
    </div>
  );
}

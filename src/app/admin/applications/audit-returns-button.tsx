"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { auditStaleReturns } from "@/actions/audit-stale-returns";

/**
 * One-click cross-check of every FAILED / RETURNED / PROCESSING
 * Payment against Increase's live transfer status. Use when stale
 * RETURNED rows in our DB don't match what Increase actually shows
 * (e.g., a `pending_transaction` is still attached, meaning the
 * debit is still in flight).
 */
export function AuditReturnsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<{
    checked: number;
    updated: number;
    rows: Array<{
      applicationCode: string;
      borrowerName: string;
      paymentNumber: number;
      amount: number;
      before: string;
      liveStatus: string;
      after: string;
      reason: string | null;
    }>;
  } | null>(null);

  async function handleClick() {
    setRunning(true);
    const tid = toast.loading("Polling Increase for every stale payment...", { duration: 120_000 });
    const r = await auditStaleReturns();
    toast.dismiss(tid);
    setRunning(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setReport({ checked: r.checked, updated: r.updated, rows: r.rows });
    if (r.updated > 0) {
      toast.success(`Audited ${r.checked}, updated ${r.updated}`);
      router.refresh();
    } else {
      toast.info(`Audited ${r.checked}, all in sync with Increase`);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white text-[#15803d] hover:bg-[#f0fdf4] disabled:opacity-60 text-[12px] font-semibold px-3 py-1.5 transition-colors self-start"
        title="Cross-check every FAILED / RETURNED / PROCESSING Payment against Increase's live status"
      >
        <svg className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {running ? "Auditing" : "Audit against Increase"}
      </button>
      {report && (
        <div className="rounded-lg border border-[#e4e4e7] bg-white p-3 text-[12px] max-w-3xl">
          <div className="font-semibold mb-1.5">
            Checked {report.checked} · Updated {report.updated}
          </div>
          {report.rows.length === 0 ? (
            <p className="text-[#71717a]">Nothing to check.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[#71717a] border-b border-[#f4f4f5]">
                  <th className="text-left py-1">Borrower</th>
                  <th className="text-left py-1">#</th>
                  <th className="text-left py-1">Was</th>
                  <th className="text-left py-1">Increase</th>
                  <th className="text-left py-1">Now</th>
                  <th className="text-left py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => {
                  const changed = r.before !== r.after;
                  return (
                    <tr key={i} className={changed ? "bg-[#fff7ed]" : ""}>
                      <td className="py-1">{r.borrowerName} <span className="text-[#a1a1aa]">({r.applicationCode})</span></td>
                      <td className="py-1">{r.paymentNumber}</td>
                      <td className="py-1">{r.before}</td>
                      <td className="py-1 text-[#71717a]">{r.liveStatus}</td>
                      <td className={`py-1 font-semibold ${changed ? "text-[#15803d]" : ""}`}>{r.after}</td>
                      <td className="py-1 text-[10px] text-[#71717a]">{r.reason ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

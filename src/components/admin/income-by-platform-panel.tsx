"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reanalyzeIncome } from "@/actions/reanalyze-income";
import type { IncomeByPlatform } from "@/lib/income-by-platform";

function formatMonth(ym: string): string {
  // "2026-06" -> "Jun 26"
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtMoney(n: number): string {
  if (n === 0) return "-";
  return `$${Math.round(n).toLocaleString()}`;
}

export function IncomeByPlatformPanel({
  applicationId,
  json,
}: {
  applicationId: string;
  json: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  let data: IncomeByPlatform | null = null;
  if (json) {
    try {
      data = JSON.parse(json) as IncomeByPlatform;
    } catch {
      data = null;
    }
  }

  async function handleReanalyze() {
    setLoading(true);
    try {
      const r = await reanalyzeIncome(applicationId);
      if (r.ok) {
        toast.success("Platform breakdown updated");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-analyze failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
            <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Income by platform (from bank statement)
          </h2>
          <p className="text-[11px] text-[#71717a] mt-0.5">
            Deposits grouped by gig platform and month. Green rows are the platform the applicant listed.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReanalyze}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white text-[12px] font-semibold px-3 py-2 hover:bg-[#166534] disabled:opacity-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {loading ? "Analyzing..." : "Re-analyze"}
        </button>
      </div>

      {!data ? (
        <div className="rounded-lg bg-[#fafafa] border border-dashed border-[#e4e4e7] p-6 text-center">
          <p className="text-[13px] text-[#71717a]">
            Not analyzed yet. Click <span className="font-semibold">"Re-analyze"</span> to run the platform breakdown from the uploaded bank statement.
          </p>
        </div>
      ) : data.platforms.length === 0 ? (
        <div className="rounded-lg bg-[#fafafa] border border-[#e4e4e7] p-4">
          <p className="text-[13px] text-[#71717a]">No income deposits found in the parsed statement.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-[#e4e4e7]">
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap">
                  Platform
                </th>
                {data.months.map((m) => (
                  <th
                    key={m}
                    className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap"
                  >
                    {formatMonth(m)}
                  </th>
                ))}
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.platforms.map((p) => (
                <tr
                  key={p.platform}
                  className={`border-b border-[#f4f4f5] ${p.isListed ? "bg-green-50" : ""}`}
                >
                  <td className="py-2 px-3 font-medium text-[#0a0a0a] whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      {p.platform}
                      {p.isListed && (
                        <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#15803d]">
                          listed
                        </span>
                      )}
                    </span>
                  </td>
                  {p.byMonth.map((bm) => (
                    <td key={bm.month} className="py-2 px-3 text-right text-[#52525b] tabular-nums whitespace-nowrap">
                      {fmtMoney(bm.amount)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-[#0a0a0a] tabular-nums whitespace-nowrap">
                    {fmtMoney(p.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e4e4e7] bg-[#fafafa]">
                <td className="py-2 px-3 font-bold text-[#0a0a0a] text-[11px] uppercase tracking-wide">
                  Total
                </td>
                {data.months.map((m) => {
                  const monthTotal = data!.platforms.reduce((s, p) => {
                    const bm = p.byMonth.find((x) => x.month === m);
                    return s + (bm?.amount ?? 0);
                  }, 0);
                  return (
                    <td key={m} className="py-2 px-3 text-right font-bold text-[#0a0a0a] tabular-nums whitespace-nowrap">
                      {fmtMoney(monthTotal)}
                    </td>
                  );
                })}
                <td className="py-2 px-3 text-right font-bold text-[#15803d] tabular-nums whitespace-nowrap">
                  {fmtMoney(data.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

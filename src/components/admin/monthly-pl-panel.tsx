"use client";

import type { MonthlyPL } from "@/lib/monthly-pl";

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtMoney(n: number): string {
  if (!n) return "-";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "$0";
  return r < 0 ? `-$${Math.abs(r).toLocaleString()}` : `$${r.toLocaleString()}`;
}

export function MonthlyPLPanel({ json }: { json: string | null }) {
  let data: MonthlyPL | null = null;
  if (json) {
    try {
      data = JSON.parse(json) as MonthlyPL;
    } catch {
      data = null;
    }
  }

  const hasData = data && data.months.length > 0;

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
      <div className="mb-4">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
          <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
          Monthly P&amp;L (from bank statement)
        </h2>
        <p className="text-[11px] text-[#71717a] mt-0.5">
          Revenue minus expenses by category, per month. Use the Re-analyze button above to refresh from the statement.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-lg bg-[#fafafa] border border-dashed border-[#e4e4e7] p-6 text-center">
          <p className="text-[13px] text-[#71717a]">
            Not analyzed yet. Click <span className="font-semibold">&quot;Re-analyze&quot;</span> on the income panel above to build the P&amp;L from the uploaded bank statement.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-[#e4e4e7]">
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap">
                  Line
                </th>
                {data!.months.map((m) => (
                  <th key={m} className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap">
                    {formatMonth(m)}
                  </th>
                ))}
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Revenue */}
              <tr className="border-b border-[#f4f4f5] bg-green-50">
                <td className="py-2 px-3 font-semibold text-[#166534] whitespace-nowrap">Revenue</td>
                {data!.revenueByMonth.map((bm) => (
                  <td key={bm.month} className="py-2 px-3 text-right text-[#166534] tabular-nums whitespace-nowrap">
                    {fmtMoney(bm.amount)}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-bold text-[#166534] tabular-nums whitespace-nowrap">
                  {fmtMoney(data!.totalRevenue)}
                </td>
              </tr>

              {/* Expenses header */}
              <tr className="border-b border-[#f4f4f5]">
                <td className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold" colSpan={data!.months.length + 2}>
                  Expenses
                </td>
              </tr>
              {data!.expenseCategories.map((row) => (
                <tr key={row.category} className="border-b border-[#f4f4f5]">
                  <td className="py-2 px-3 pl-6 text-[#52525b] whitespace-nowrap">{row.category}</td>
                  {row.byMonth.map((bm) => (
                    <td key={bm.month} className="py-2 px-3 text-right text-[#52525b] tabular-nums whitespace-nowrap">
                      {fmtMoney(bm.amount)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-semibold text-[#0a0a0a] tabular-nums whitespace-nowrap">
                    {fmtMoney(row.total)}
                  </td>
                </tr>
              ))}

              {/* Total expenses */}
              <tr className="border-b border-[#f4f4f5] bg-[#fafafa]">
                <td className="py-2 px-3 font-semibold text-[#b91c1c] whitespace-nowrap">Total expenses</td>
                {data!.expenseTotalByMonth.map((bm) => (
                  <td key={bm.month} className="py-2 px-3 text-right text-[#b91c1c] tabular-nums whitespace-nowrap">
                    {bm.amount ? `-${fmtMoney(bm.amount)}` : "-"}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-bold text-[#b91c1c] tabular-nums whitespace-nowrap">
                  {data!.totalExpenses ? `-${fmtMoney(data!.totalExpenses)}` : "-"}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e4e4e7] bg-[#fafafa]">
                <td className="py-2.5 px-3 font-bold text-[#0a0a0a] text-[11px] uppercase tracking-wide">Net</td>
                {data!.netByMonth.map((bm) => (
                  <td
                    key={bm.month}
                    className={`py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${bm.amount < 0 ? "text-[#b91c1c]" : "text-[#15803d]"}`}
                  >
                    {fmtSigned(bm.amount)}
                  </td>
                ))}
                <td className={`py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${data!.netTotal < 0 ? "text-[#b91c1c]" : "text-[#15803d]"}`}>
                  {fmtSigned(data!.netTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

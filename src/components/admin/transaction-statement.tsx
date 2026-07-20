"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { getTransactionStatement, type StatementTx } from "@/actions/plaid";

const PRESETS: { label: string; days: number }[] = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
];

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function rangeFor(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export function TransactionStatement({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [data, setData] = useState<{
    transactions: StatementTx[];
    currentBalance: number | null;
    totalIn: number;
    totalOut: number;
    net: number;
    count: number;
  } | null>(null);

  async function load(nextDays: number) {
    setLoading(true);
    try {
      const { startDate, endDate } = rangeFor(nextDays);
      const r = await getTransactionStatement(applicationId, startDate, endDate);
      if (r.ok) {
        setData({
          transactions: r.transactions,
          currentBalance: r.currentBalance,
          totalIn: r.totalIn,
          totalOut: r.totalOut,
          net: r.net,
          count: r.count,
        });
      } else {
        toast.error(r.error || "Failed to load statement");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load statement");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!data) load(days);
  }

  function handlePreset(nextDays: number) {
    setDays(nextDays);
    load(nextDays);
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.transactions.filter((tx) => {
      if (dir === "in" && tx.amount >= 0) return false;
      if (dir === "out" && tx.amount < 0) return false;
      if (q) {
        const hay = `${tx.name} ${tx.merchantName ?? ""} ${tx.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, dir]);

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={handleOpen}
          className="text-sm font-medium text-[#15803d] hover:text-[#166534]"
        >
          View full statement →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-black">Full statement</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-[#71717a] hover:text-black">
          Hide
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-[#e4e4e7] overflow-hidden">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              disabled={loading}
              className={`px-2.5 py-1.5 text-xs font-medium border-r border-[#e4e4e7] last:border-r-0 disabled:opacity-50 ${
                days === p.days ? "bg-[#15803d] text-white" : "bg-white text-[#52525b] hover:bg-[#fafafa]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-[#e4e4e7] overflow-hidden">
          {(["all", "in", "out"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`px-2.5 py-1.5 text-xs font-medium capitalize border-r border-[#e4e4e7] last:border-r-0 ${
                dir === d ? "bg-[#18181b] text-white" : "bg-white text-[#52525b] hover:bg-[#fafafa]"
              }`}
            >
              {d === "all" ? "All" : d === "in" ? "Money in" : "Money out"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description / category"
          className="flex-1 min-w-[180px] text-xs border border-[#e4e4e7] rounded-lg px-3 py-1.5 outline-none focus:border-[#15803d]"
        />
      </div>

      {/* Totals */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Totals label="Money in" value={money(data.totalIn)} accent="text-[#15803d]" />
          <Totals label="Money out" value={money(data.totalOut)} accent="text-black" />
          <Totals label="Net" value={`${data.net < 0 ? "−" : ""}${money(data.net)}`} accent={data.net < 0 ? "text-[#b91c1c]" : "text-[#15803d]"} />
          <Totals label="Current balance" value={data.currentBalance == null ? "—" : money(data.currentBalance)} accent="text-black" />
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[#a1a1aa]">Loading statement…</p>
      ) : data && rows.length > 0 ? (
        <>
          <p className="text-[11px] text-[#a1a1aa] mb-1.5">
            Showing {rows.length} of {data.count} transactions. Balance is estimated from the current balance.
          </p>
          <div className="overflow-auto max-h-[520px] rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-[#fafafa] text-[#71717a] sticky top-0">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Date</th>
                  <th className="text-left font-semibold px-3 py-2">Description</th>
                  <th className="text-left font-semibold px-3 py-2">Category</th>
                  <th className="text-right font-semibold px-3 py-2">Amount</th>
                  <th className="text-right font-semibold px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => {
                  const isDeposit = tx.amount < 0;
                  return (
                    <tr key={tx.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[#52525b] font-mono whitespace-nowrap">{tx.date}</td>
                      <td className="px-3 py-2 text-black">
                        {tx.merchantName || tx.name}
                        {tx.pending && (
                          <span className="ml-2 inline-block rounded-full bg-[#f4f4f5] text-[#71717a] px-1.5 py-0.5 text-[9px] uppercase font-semibold">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#71717a]">{tx.category ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${isDeposit ? "text-[#15803d]" : "text-black"}`}>
                        {isDeposit ? "+" : "−"}{money(tx.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#52525b] font-mono whitespace-nowrap">
                        {tx.balanceAfter == null ? "—" : money(tx.balanceAfter)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#a1a1aa]">No transactions match.</p>
      )}
    </div>
  );
}

function Totals({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg bg-[#f8faf8] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">{label}</p>
      <p className={`text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}

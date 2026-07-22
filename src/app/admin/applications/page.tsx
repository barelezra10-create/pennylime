import { getAdvances } from "@/actions/advances";
import { AdvancesClient } from "../advances/advances-client";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const isPending = stage === "Pending";

  const { advances, summary } = await getAdvances();

  // Everything on the Pending tab is about pending applicants only.
  const pendingRows = advances.filter((a) => a.stageTab === "Pending");
  const pendingCount = pendingRows.length;
  const pendingTotalAsk = pendingRows.reduce((s, a) => s + a.requestedAmount, 0);
  const pendingAvgAsk = pendingCount ? pendingTotalAsk / pendingCount : 0;
  // loanTermMonths is misnamed in the schema — the values are WEEKS.
  const pendingAvgWeeks = pendingCount ? pendingRows.reduce((s, a) => s + a.termMonths, 0) / pendingCount : 0;

  const profCounts = new Map<string, number>();
  for (const a of pendingRows) {
    if (!a.platform) continue;
    for (const raw of a.platform.split(",").map((s) => s.trim()).filter(Boolean)) {
      const k = raw.toLowerCase();
      profCounts.set(k, (profCounts.get(k) || 0) + 1);
    }
  }
  const topProfessions = [...profCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  const title = stage ?? "Customers";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">{title}</h1>
        <p className="text-sm text-[#71717a] mt-1">
          {isPending ? "New applicants awaiting a decision." : "Manage your advances - payments, status, and contact, all in one place."}
        </p>
      </div>

      {/* Pending analytics — pending applicants only */}
      {isPending && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Stat label="Pending" value={`${pendingCount}`} sub="awaiting review" accent />
            <Stat label="Total ask" value={money(pendingTotalAsk)} sub="pending advances requested" accent />
            <Stat label="Avg ask" value={money(pendingAvgAsk)} sub="avg requested per applicant" />
            <Stat label="Avg length" value={`${pendingAvgWeeks.toFixed(1)} weeks`} sub="repayment length requested" />
          </div>

          {topProfessions.length > 0 && (
            <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-3">Top professions (pending)</h3>
              <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {topProfessions.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#15803d] text-white text-[11px] font-bold shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-black truncate">{titleCase(p.name)}</div>
                      <div className="text-[11px] text-[#a1a1aa]">{p.count} applicants</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      <AdvancesClient advances={advances} summary={summary} />
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-1.5">{label}</p>
      <p className={`text-[22px] font-extrabold tabular-nums leading-none ${accent ? "text-[#15803d]" : "text-black"}`}>{value}</p>
      <p className="text-[11px] text-[#a1a1aa] mt-1.5">{sub}</p>
    </div>
  );
}

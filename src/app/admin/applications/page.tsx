import { getAdvances } from "@/actions/advances";
import { getApplicantStats } from "@/actions/applicant-stats";
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

  const [{ advances, summary }, stats] = await Promise.all([
    getAdvances(),
    isPending ? getApplicantStats() : Promise.resolve(null),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">Customers</h1>
        <p className="text-sm text-[#71717a] mt-1">Manage your advances - payments, status, and contact, all in one place.</p>
      </div>

      {/* Applicant analytics — Pending tab only */}
      {isPending && stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <Stat label="Total ask" value={money(stats.totalAsk)} sub="all loan requests" accent />
            <Stat label="Requested" value={`${stats.requestedCount}`} sub="applicants" />
            <Stat label="Advances" value={`${stats.advancesCount}`} sub="funded" accent />
            <Stat label="Avg advance" value={money(stats.avgAdvance)} sub="avg funded amount" />
            <Stat label="Avg payment time" value={stats.avgPaymentDays == null ? "No payoffs yet" : `${stats.avgPaymentDays} days`} sub="funded to paid off" />
          </div>

          {stats.topProfessions.length > 0 && (
            <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-3">Top professions</h3>
              <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {stats.topProfessions.map((p, i) => (
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

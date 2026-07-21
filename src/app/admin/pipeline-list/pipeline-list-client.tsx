"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES, STAGE_COLORS } from "@/lib/contact-helpers";
import type { PipelineRecord } from "@/actions/pipeline-records";

// Stages that are post-funding: show outstanding balance, not requested amount.
const FUNDED_STAGES = new Set(["FUNDED", "REPAYING", "LATE", "PAID_OFF", "DEFAULTED"]);

function fmt(n: number) {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StagePill({ stage }: { stage: string }) {
  const colors = STAGE_COLORS[stage] ?? { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" };
  const label = stage.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.05em] ${colors.bg} ${colors.text}`}
    >
      {label}
    </span>
  );
}

function StageChip({
  stage,
  count,
  active,
  onClick,
}: {
  stage: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const colors = STAGE_COLORS[stage] ?? { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors whitespace-nowrap
        ${active
          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
          : "bg-white text-[#52525b] border-[#e4e4e7] hover:border-[#a1a1aa] hover:text-black"
        }`}
    >
      <span className={active ? "" : `${colors.text}`}>{stage.replace(/_/g, " ")}</span>
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
          ${active ? "bg-white text-[#0a0a0a]" : "bg-[#f4f4f5] text-[#52525b]"}`}
      >
        {count}
      </span>
    </button>
  );
}

function recordHref(r: PipelineRecord): string {
  if (r.applicationId) return `/admin/applications/${r.applicationId}?from=Pipeline`;
  return `/admin/contacts/${r.id}`;
}

type Props = {
  records: PipelineRecord[];
};

export function PipelineListClient({ records }: Props) {
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Stage counts (unfiltered by search, so chips always show true count)
  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of records) {
      map[r.stage] = (map[r.stage] ?? 0) + 1;
    }
    return map;
  }, [records]);

  // Stages that actually have records, in PIPELINE_STAGES order
  const presentStages = useMemo(
    () => PIPELINE_STAGES.filter((s) => (stageCounts[s] ?? 0) > 0),
    [stageCounts],
  );

  // Filtered records
  const filtered = useMemo(() => {
    let out = records;
    if (activeStage) out = out.filter((r) => r.stage === activeStage);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          `${r.firstName} ${r.lastName ?? ""}`.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [records, activeStage, search]);

  // Group by stage (only when "All" is selected)
  const grouped = useMemo(() => {
    if (activeStage) return null;
    const map: Record<string, PipelineRecord[]> = {};
    for (const r of filtered) {
      if (!map[r.stage]) map[r.stage] = [];
      map[r.stage].push(r);
    }
    return map;
  }, [filtered, activeStage]);

  const stagesInView = activeStage
    ? [activeStage]
    : PIPELINE_STAGES.filter((s) => (grouped?.[s]?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-[#e4e4e7] px-4 py-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#a1a1aa]">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone..."
            className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[#e4e4e7] bg-[#fafafa] text-[#0a0a0a] placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 focus:border-[#15803d]"
          />
        </div>

        <div className="h-5 w-px bg-[#e4e4e7] hidden sm:block" />

        {/* All chip */}
        <button
          type="button"
          onClick={() => setActiveStage(null)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors whitespace-nowrap
            ${activeStage === null
              ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
              : "bg-white text-[#52525b] border-[#e4e4e7] hover:border-[#a1a1aa] hover:text-black"
            }`}
        >
          All
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeStage === null ? "bg-white text-[#0a0a0a]" : "bg-[#f4f4f5] text-[#52525b]"}`}
          >
            {records.length}
          </span>
        </button>

        {/* Stage chips */}
        {presentStages.map((s) => (
          <StageChip
            key={s}
            stage={s}
            count={stageCounts[s] ?? 0}
            active={activeStage === s}
            onClick={() => setActiveStage(activeStage === s ? null : s)}
          />
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e4e4e7] px-6 py-16 text-center">
          <p className="text-[13px] text-[#a1a1aa]">No records match your filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#e4e4e7] bg-[#fafafa]">
                <th className="px-4 py-2.5 text-left font-semibold text-[#52525b] w-[220px]">Person</th>
                <th className="px-4 py-2.5 text-left font-semibold text-[#52525b] w-[130px]">Stage</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#52525b] w-[110px]">Requested</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#52525b] w-[110px]">Outstanding</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#52525b] w-[120px]">Next payment</th>
                <th className="px-4 py-2.5 text-left font-semibold text-[#52525b] w-[110px]">Rep</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[#52525b] w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {stagesInView.map((stage) => {
                const rows = activeStage ? filtered : (grouped?.[stage] ?? []);
                if (rows.length === 0) return null;

                return [
                  // Stage subheader row (only in "All" view)
                  activeStage === null ? (
                    <tr key={`hdr-${stage}`} className="bg-[#fafafa] border-b border-t border-[#e4e4e7]">
                      <td colSpan={7} className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <StagePill stage={stage} />
                          <span className="text-[11px] text-[#a1a1aa] font-medium">{rows.length} record{rows.length !== 1 ? "s" : ""}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null,

                  // Data rows for this stage
                  ...rows.map((r, idx) => {
                    const isFunded = FUNDED_STAGES.has(r.stage);
                    const href = recordHref(r);

                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[#f4f4f5] last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer`}
                        onClick={() => { window.location.href = href; }}
                      >
                        {/* Person */}
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-[#0a0a0a] truncate leading-tight">
                            {r.firstName}{r.lastName ? ` ${r.lastName}` : ""}
                          </p>
                          <p className="text-[11px] text-[#71717a] truncate leading-tight mt-0.5">{r.email}</p>
                          {r.phone && (
                            <p className="text-[10px] text-[#a1a1aa] truncate leading-tight">{r.phone}</p>
                          )}
                        </td>

                        {/* Stage */}
                        <td className="px-4 py-2.5">
                          <StagePill stage={r.stage} />
                          {r.advanceStatus && (
                            <p className="text-[10px] text-[#a1a1aa] mt-0.5">{r.advanceStatus}</p>
                          )}
                        </td>

                        {/* Requested amount */}
                        <td className="px-4 py-2.5 text-right">
                          {r.requestedAmount != null ? (
                            <span className={`font-medium ${isFunded ? "text-[#a1a1aa]" : "text-[#0a0a0a]"}`}>
                              {fmt(r.requestedAmount)}
                            </span>
                          ) : (
                            <span className="text-[#d4d4d8]">-</span>
                          )}
                        </td>

                        {/* Outstanding */}
                        <td className="px-4 py-2.5 text-right">
                          {isFunded ? (
                            r.outstanding > 0 ? (
                              <span className="font-semibold text-[#dc2626]">{fmt(r.outstanding)}</span>
                            ) : (
                              <span className="text-[#15803d] font-medium">Paid off</span>
                            )
                          ) : (
                            <span className="text-[#d4d4d8]">-</span>
                          )}
                        </td>

                        {/* Next payment */}
                        <td className="px-4 py-2.5 text-right">
                          {r.nextDueDate && r.nextDueAmount > 0 ? (
                            <div>
                              <p className="font-medium text-[#0a0a0a]">{fmt(r.nextDueAmount)}</p>
                              <p className="text-[10px] text-[#71717a]">{fmtDate(r.nextDueDate)}</p>
                            </div>
                          ) : (
                            <span className="text-[#d4d4d8]">-</span>
                          )}
                        </td>

                        {/* Rep */}
                        <td className="px-4 py-2.5">
                          {r.assignedRepName ? (
                            <span className="text-[#52525b] truncate block">{r.assignedRepName}</span>
                          ) : (
                            <span className="text-[#d4d4d8]">Unassigned</span>
                          )}
                        </td>

                        {/* Open link */}
                        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 text-[#15803d] font-semibold hover:text-[#166534] transition-colors"
                          >
                            Open
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    );
                  }),
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

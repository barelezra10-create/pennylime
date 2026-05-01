"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";
import { fmtMoney, cadenceLabel, type LoanSummary } from "@/lib/loan-summary";

interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  stage: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  assignedRep: { id: string; name: string } | null;
  loan: LoanSummary;
}

interface Metrics {
  total: number;
  byStage: Record<string, number>;
  newThisWeek: number;
  abandoned: number;
}

interface ContactsClientProps {
  contacts: Contact[];
  total: number;
  metrics: Metrics;
  team: { id: string; name: string }[];
}

const PAGE_SIZE = 50;

export function ContactsClient({ contacts, total, metrics }: ContactsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let result = contacts;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          (c.lastName || "").toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone || "").includes(q)
      );
    }

    if (stageFilter !== "ALL") {
      result = result.filter((c) => c.stage === stageFilter);
    }

    return result;
  }, [contacts, search, stageFilter]);

  // Top KPIs from filtered set: total active loan principal, total remaining, # late
  const kpis = useMemo(() => {
    let activePrincipal = 0;
    let remaining = 0;
    let late = 0;
    let withLoans = 0;
    for (const c of contacts) {
      if (c.loan.hasLoan) {
        withLoans++;
        activePrincipal += c.loan.fundedAmount || c.loan.loanAmount;
        remaining += c.loan.remainingAmount;
        if (c.loan.isLate) late++;
      }
    }
    return { withLoans, activePrincipal, remaining, late };
  }, [contacts]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const showingFrom = totalFiltered === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, totalFiltered);

  function handleStageFilter(stage: string) {
    setStageFilter(stage);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        description={`${total} total · ${metrics.newThisWeek} new this week · ${kpis.withLoans} with active loans`}
      />

      {/* Loan KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Loans" value={kpis.withLoans.toString()} sub="contacts with loans" />
        <KpiTile label="Total principal" value={fmtMoney(kpis.activePrincipal)} sub="across all loans" accent="bg-[#15803d]" />
        <KpiTile label="Outstanding" value={fmtMoney(kpis.remaining)} sub="remaining to collect" accent="bg-[#0ea5e9]" />
        <KpiTile label="Late" value={kpis.late.toString()} sub="past-due payments" accent={kpis.late > 0 ? "bg-[#dc2626]" : "bg-[#a1a1aa]"} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="w-full pl-9 pr-4 py-2 text-[13px] border border-[#e4e4e7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#15803d]/30 focus:border-[#15803d] placeholder:text-[#a1a1aa]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStageFilter("ALL")}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
              stageFilter === "ALL" ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
            }`}
          >
            All ({total})
          </button>
          {PIPELINE_STAGES.map((stage) => {
            const count = metrics.byStage[stage] || 0;
            return (
              <button
                key={stage}
                onClick={() => handleStageFilter(stage)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                  stageFilter === stage ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                }`}
              >
                {stage.replace("_", " ")} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e4e4e7] bg-[#fafafa]">
                <Th>Contact</Th>
                <Th>Stage</Th>
                <Th align="right">Loan</Th>
                <Th>Progress</Th>
                <Th align="right">Payment</Th>
                <Th align="right">Balance</Th>
                <Th>Next due</Th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-[#a1a1aa]">
                    No contacts found
                  </td>
                </tr>
              ) : (
                paginated.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => router.push(`/admin/contacts/${contact.id}`)}
                    className="border-b border-[#f4f4f5] hover:bg-[#f8f8f6] cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="text-[13px] font-semibold text-black">
                        {contact.firstName} {contact.lastName || ""}
                      </div>
                      <div className="text-[11px] text-[#71717a] truncate max-w-[200px]">{contact.email}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StageBadge stage={contact.stage} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {contact.loan.hasLoan ? (
                        <span className="text-[13px] font-bold text-black tabular-nums">
                          {fmtMoney(contact.loan.fundedAmount || contact.loan.loanAmount)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#a1a1aa]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {contact.loan.hasLoan && contact.loan.totalPayments > 0 ? (
                        <div className="min-w-[140px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-[#71717a] tabular-nums">
                              {contact.loan.paidPayments} of {contact.loan.totalPayments} paid
                            </span>
                            <span className="text-[#a1a1aa] tabular-nums">{contact.loan.progressPct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#f4f4f5] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${contact.loan.isComplete ? "bg-[#15803d]" : contact.loan.isLate ? "bg-[#dc2626]" : "bg-[#0ea5e9]"}`}
                              style={{ width: `${contact.loan.progressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#a1a1aa]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {contact.loan.hasLoan && contact.loan.perPaymentAmount > 0 ? (
                        <span className="text-[13px] font-semibold text-black tabular-nums">
                          {fmtMoney(contact.loan.perPaymentAmount)}
                          <span className="text-[#a1a1aa] font-normal">{cadenceLabel(contact.loan.cadence)}</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#a1a1aa]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {contact.loan.hasLoan ? (
                        <span className="text-[13px] font-semibold text-black tabular-nums">
                          {fmtMoney(contact.loan.remainingAmount)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#a1a1aa]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {contact.loan.nextDue ? (
                        <NextDuePill nextDue={contact.loan.nextDue} isLate={contact.loan.isLate} />
                      ) : contact.loan.isComplete ? (
                        <span className="text-[11px] text-[#15803d] font-semibold uppercase tracking-[0.04em]">Paid off</span>
                      ) : (
                        <span className="text-[12px] text-[#a1a1aa]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e4e4e7]">
          <span className="text-[12px] text-[#a1a1aa]">
            {totalFiltered === 0 ? "No results" : `${showingFrom}-${showingTo} of ${totalFiltered}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 text-[12px] font-medium border border-[#e4e4e7] rounded-lg text-[#71717a] hover:bg-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-[12px] text-[#71717a]">{safePage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 text-[12px] font-medium border border-[#e4e4e7] rounded-lg text-[#71717a] hover:bg-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-[#71717a] ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 relative overflow-hidden">
      {accent && <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />}
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-1.5">{label}</p>
      <p className="text-[20px] font-extrabold tracking-[-0.02em] text-black tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-[#a1a1aa] mt-1.5">{sub}</p>
    </div>
  );
}

function NextDuePill({ nextDue, isLate }: { nextDue: { date: string; amount: number; status: string }; isLate: boolean }) {
  const due = new Date(nextDue.date);
  const days = Math.floor((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  let label: string;
  let cls: string;
  if (isLate) {
    label = `${Math.abs(days)}d late`;
    cls = "text-[#dc2626] bg-[#fef2f2]";
  } else if (days === 0) {
    label = "Due today";
    cls = "text-[#b45309] bg-[#fffbeb]";
  } else if (days === 1) {
    label = "Due tomorrow";
    cls = "text-[#b45309] bg-[#fffbeb]";
  } else {
    label = `In ${days}d`;
    cls = "text-[#71717a] bg-[#fafafa]";
  }
  return (
    <div>
      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-[0.04em] rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
      <div className="text-[10px] text-[#a1a1aa] mt-0.5 tabular-nums">{due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
    </div>
  );
}

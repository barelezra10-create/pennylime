"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";

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
        description={`${total} total contacts · ${metrics.newThisWeek} new this week`}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Search */}
        <div className="relative max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a1a1aa]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="w-full pl-9 pr-4 py-2 text-[13px] border border-[#e4e4e7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#3052FF]/30 focus:border-[#3052FF] placeholder:text-[#a1a1aa]"
          />
        </div>

        {/* Stage filter pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStageFilter("ALL")}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
              stageFilter === "ALL"
                ? "bg-[#3052FF] text-white"
                : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
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
                  stageFilter === stage
                    ? "bg-[#3052FF] text-white"
                    : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
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
              <tr className="border-b border-[#e4e4e7]">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Phone
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Stage
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Rep
                </th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa]">
                  Created
                </th>
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
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-semibold text-black">
                        {contact.firstName} {contact.lastName || ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#71717a]">{contact.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#71717a]">{contact.phone || ","}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={contact.stage} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#71717a]">{contact.source || ","}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#71717a]">
                        {contact.assignedRep?.name || ","}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#a1a1aa]">
                        {new Date(contact.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e4e4e7]">
          <span className="text-[12px] text-[#a1a1aa]">
            {totalFiltered === 0
              ? "No results"
              : `${showingFrom}-${showingTo} of ${totalFiltered}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 text-[12px] font-medium border border-[#e4e4e7] rounded-lg text-[#71717a] hover:bg-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-[12px] text-[#71717a]">
              {safePage} / {totalPages}
            </span>
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

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationTable } from "@/components/application-table";
import { PageHeader } from "@/components/admin/page-header";
import { AuditReturnsButton } from "./audit-returns-button";
import type { ApplicationWithDocuments } from "@/types";

type FilterTab = "All" | "Pending" | "Approved" | "Active" | "Paid" | "Default";

// One stage tab can cover several underlying statuses. "Approved" = offer out
// but not taken yet; "Active" = funded and repaying (incl. behind/late);
// "Default" = defaulted or in collections.
const STAGE_STATUSES: Record<FilterTab, string[] | null> = {
  All: null,
  Pending: ["PENDING", "APPLICANT"],
  Approved: ["APPROVED", "OFFER_ACCEPTED"],
  Active: ["FUNDED", "ACTIVE", "REPAYING", "LATE"],
  Paid: ["PAID_OFF"],
  Default: ["DEFAULTED", "COLLECTIONS"],
};

const TABS: FilterTab[] = ["All", "Pending", "Approved", "Active", "Paid", "Default"];

export function ApplicationsClient({
  applications,
}: {
  applications: ApplicationWithDocuments[];
}) {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const initialTab: FilterTab = TABS.includes(fromParam as FilterTab)
    ? (fromParam as FilterTab)
    : "All";
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab);
  const [search, setSearch] = useState("");

  const stageStatuses = STAGE_STATUSES[activeTab];
  const filtered = stageStatuses
    ? applications.filter((a) => stageStatuses.includes(a.status))
    : applications;

  const searched = search.trim()
    ? filtered.filter((a) => {
        const q = search.toLowerCase();
        return (
          a.firstName.toLowerCase().includes(q) ||
          a.lastName.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.applicationCode.toLowerCase().includes(q)
        );
      })
    : filtered;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Applications" />
        <AuditReturnsButton />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? "bg-[#1a1a1a] text-white rounded-lg px-3 py-1.5 text-sm font-medium"
                : "text-[#71717a] hover:text-black px-3 py-1.5 text-sm font-medium"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, email, or code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-xl border border-[#e4e4e7] bg-white px-4 py-2.5 text-[13px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#e4e4e7]"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        <ApplicationTable applications={searched} fromTab={activeTab} />
      </div>
    </div>
  );
}

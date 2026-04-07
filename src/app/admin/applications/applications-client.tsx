"use client";

import { useState } from "react";
import { ApplicationTable } from "@/components/application-table";
import { PageHeader } from "@/components/admin/page-header";
import type { ApplicationWithDocuments } from "@/types";

type FilterTab = "All" | "Pending" | "Approved" | "Active" | "Late" | "Collections" | "Defaulted" | "Paid Off";

const STATUS_MAP: Record<FilterTab, string | null> = {
  All: null,
  Pending: "PENDING",
  Approved: "APPROVED",
  Active: "ACTIVE",
  Late: "LATE",
  Collections: "COLLECTIONS",
  Defaulted: "DEFAULTED",
  "Paid Off": "PAID_OFF",
};

const TABS: FilterTab[] = ["All", "Pending", "Approved", "Active", "Late", "Collections", "Defaulted", "Paid Off"];

export function ApplicationsClient({
  applications,
}: {
  applications: ApplicationWithDocuments[];
}) {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");

  const filtered =
    STATUS_MAP[activeTab] === null
      ? applications
      : applications.filter((a) => a.status === STATUS_MAP[activeTab]);

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
      <PageHeader title="Applications" />

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
        <ApplicationTable applications={searched} />
      </div>
    </div>
  );
}

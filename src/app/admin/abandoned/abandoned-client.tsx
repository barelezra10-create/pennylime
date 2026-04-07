"use client";

import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatCard } from "@/components/admin/stat-card";

const TOTAL_STEPS = 7;

type ContactItem = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  lastAppStep: number | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  assignedRep: { id: string; name: string } | null;
  tags: string[];
};

interface Props {
  contacts: ContactItem[];
  total: number;
  stats: {
    thisWeek: number;
    stepCounts: Record<number, number>;
    total: number;
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STEP_NAMES: Record<number, string> = {
  1: "Amount",
  2: "Your Info",
  3: "Platforms",
  4: "Identity",
  5: "Bank Link",
  6: "Documents",
  7: "Review",
};

export function AbandonedClient({ contacts, total, stats }: Props) {
  // Sort by lastAppStep descending (warmest leads first)
  const sorted = [...contacts].sort((a, b) => (b.lastAppStep ?? 0) - (a.lastAppStep ?? 0));

  const topStep = Object.entries(stats.stepCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

  return (
    <div>
      <PageHeader
        title="Abandoned Applications"
        description={`${total} contact${total !== 1 ? "s" : ""} who started but did not complete their application`}
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Abandoned" value={stats.total} color="red" />
        <StatCard label="This Week" value={stats.thisWeek} color="amber" />
        <StatCard
          label="Top Dropout Step"
          value={topStep ? `Step ${topStep}` : "N/A"}
          color="gray"
        />
        <StatCard label="Recovery Rate" value="0%" color="green" />
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e4e4e7]">
          <EmptyState
            title="No abandoned applications"
            description="Contacts tagged with 'abandoned-app' will appear here. This tag is auto-applied when a user starts an application but does not submit."
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e4e4e7] bg-[#fafafa]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Name</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Email</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Last Step</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Source</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Time Since</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Rep</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((contact, i) => {
                const step = contact.lastAppStep ?? 0;
                const stepName = STEP_NAMES[step] ?? `Step ${step}`;
                return (
                  <tr
                    key={contact.id}
                    className={`border-b border-[#f4f4f5] hover:bg-[#fafafa] transition-colors ${
                      i === sorted.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-black">
                        {contact.firstName} {contact.lastName}
                      </p>
                      {contact.phone && (
                        <p className="text-[12px] text-[#a1a1aa]">{contact.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#71717a]">{contact.email}</td>
                    <td className="px-4 py-3">
                      {step > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffbeb] px-2.5 py-1 text-[11px] font-semibold text-[#b45309]">
                          Step {step}/{TOTAL_STEPS}: {stepName}
                        </span>
                      ) : (
                        <span className="text-[#a1a1aa] text-[12px]">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#71717a] text-[13px]">{contact.source ?? ","}</td>
                    <td className="px-4 py-3 text-[#71717a] text-[13px]">{relativeTime(contact.createdAt)}</td>
                    <td className="px-4 py-3 text-[#71717a] text-[13px]">
                      {contact.assignedRep?.name ?? <span className="text-[#a1a1aa]">Unassigned</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

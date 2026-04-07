"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { updateEmailSequence } from "@/actions/email";
import { toast } from "sonner";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  steps: string;
  active: boolean;
  createdAt: Date;
}

function stepCount(stepsJson: string): number {
  try { return JSON.parse(stepsJson).length; } catch { return 0; }
}

export function SequencesClient({ sequences }: { sequences: Sequence[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = sequences.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function toggleActive(id: string, current: boolean) {
    try {
      await updateEmailSequence(id, { active: !current });
      toast.success(!current ? "Sequence activated" : "Sequence paused");
      router.refresh();
    } catch {
      toast.error("Failed to update sequence");
    }
  }

  return (
    <div>
      <PageHeader
        title="Sequences"
        description="Automated drip sequences triggered by contact events"
        action={{ label: "+ New Sequence", href: "/admin/email/sequences/new" }}
      />

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sequences..."
          className="flex-1 max-w-xs text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#15803d]"
        />
      </div>

      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#a1a1aa]">
            <p className="text-[15px] font-medium mb-1">No sequences yet</p>
            <p className="text-[13px]">Create a sequence to automate your email outreach.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e4e4e7]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Trigger</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Steps</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[#e4e4e7] last:border-0 hover:bg-[#f8f8f6] cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/email/sequences/${s.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-black">{s.name}</p>
                    {s.description && <p className="text-[12px] text-[#71717a]">{s.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f4f4f5] text-[#71717a] uppercase tracking-wide">
                      {s.triggerType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{stepCount(s.steps)} steps</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleActive(s.id, s.active)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${s.active ? "bg-[#15803d]" : "bg-[#d4d4d8]"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

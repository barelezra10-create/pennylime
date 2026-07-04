"use client";

import { useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  contactId: string | null;
  contactName: string | null;
  direction: string;
  kind: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  transcription: string | null;
  heard: boolean;
  agentEmail: string | null;
  createdAt: string;
};

export function CallsClient({ calls }: { calls: Row[] }) {
  const [filter, setFilter] = useState<"all" | "outbound" | "voicemail" | "unheard">("all");
  const [heardIds, setHeardIds] = useState<Set<string>>(new Set());

  const rows = calls.filter((c) => {
    if (filter === "outbound") return c.direction === "outbound";
    if (filter === "voicemail") return c.kind === "voicemail";
    if (filter === "unheard") return c.kind === "voicemail" && !c.heard && !heardIds.has(c.id);
    return true;
  });

  const markHeard = async (id: string) => {
    setHeardIds((s) => new Set(s).add(id));
    await fetch(`/api/admin/calls/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ heard: true }),
    });
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["all", "outbound", "voicemail", "unheard"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium border ${
              filter === f
                ? "bg-[#18181b] text-white border-[#18181b]"
                : "bg-white text-[#3f3f46] border-[#e4e4e7]"
            }`}
          >
            {f === "all" ? "All" : f === "outbound" ? "Outbound" : f === "voicemail" ? "Voicemails" : "Unheard"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-[13px] text-[#71717a]">No calls.</p>}
        {rows.map((c) => {
          const unheard = c.kind === "voicemail" && !c.heard && !heardIds.has(c.id);
          return (
            <div
              key={c.id}
              className={`rounded-lg border bg-white p-3 ${unheard ? "border-[#2563eb]" : "border-[#e4e4e7]"}`}
            >
              <div className="flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2">
                  {unheard && <span className="h-2 w-2 rounded-full bg-[#2563eb]" />}
                  <span className="font-medium text-[#18181b]">
                    {c.direction === "outbound" ? "Outbound" : c.kind === "voicemail" ? "Voicemail" : "Inbound"}
                  </span>
                  {c.contactId ? (
                    <Link href={`/admin/contacts/${c.contactId}`} className="text-[#2563eb] hover:underline">
                      {c.contactName || "Contact"}
                    </Link>
                  ) : (
                    <span className="text-[#71717a]">{c.direction === "outbound" ? c.toNumber : c.fromNumber}</span>
                  )}
                  {c.outcome && <span className="text-[#71717a]">({c.outcome})</span>}
                </div>
                <span className="text-[12px] text-[#71717a]">
                  {new Date(c.createdAt).toLocaleString()}
                  {c.durationSec ? ` (${c.durationSec}s)` : ""}
                </span>
              </div>
              {c.transcription && (
                <p className="mt-1.5 text-[12px] text-[#3f3f46] italic">&ldquo;{c.transcription}&rdquo;</p>
              )}
              {c.notes && <p className="mt-1.5 text-[12px] text-[#3f3f46]">{c.notes}</p>}
              {c.hasRecording && (
                <audio
                  className="mt-2 w-full h-8"
                  controls
                  preload="none"
                  src={`/api/admin/calls/${c.id}/recording`}
                  onPlay={() => unheard && markHeard(c.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

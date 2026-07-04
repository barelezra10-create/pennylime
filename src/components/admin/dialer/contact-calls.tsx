"use client";

import { useEffect, useState } from "react";

type CallRow = {
  id: string;
  direction: string;
  kind: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  durationSec: number | null;
  recordingSid: string | null;
  transcription: string | null;
  createdAt: string;
};

export function ContactCalls({ contactId }: { contactId: string }) {
  const [calls, setCalls] = useState<CallRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/calls?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((d) => setCalls(d.calls ?? []))
      .catch(() => setCalls([]));
  }, [contactId]);

  if (calls === null) return <p className="text-[13px] text-[#71717a]">Loading calls...</p>;
  if (calls.length === 0) return <p className="text-[13px] text-[#71717a]">No calls yet.</p>;

  return (
    <div className="space-y-3">
      {calls.map((c) => (
        <div key={c.id} className="rounded-lg border border-[#e4e4e7] bg-white p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#18181b]">
              {c.direction === "outbound" ? "Outbound call" : c.kind === "voicemail" ? "Voicemail" : "Inbound call"}
              {c.outcome ? ` (${c.outcome})` : ""}
            </span>
            <span className="text-[#71717a]">
              {new Date(c.createdAt).toLocaleString()}
              {c.durationSec ? ` (${c.durationSec}s)` : ""}
            </span>
          </div>
          {c.transcription && (
            <p className="mt-1.5 text-[12px] text-[#3f3f46] italic">&ldquo;{c.transcription}&rdquo;</p>
          )}
          {c.notes && <p className="mt-1.5 text-[12px] text-[#3f3f46]">{c.notes}</p>}
          {c.recordingSid && (
            <audio className="mt-2 w-full h-8" controls preload="none" src={`/api/admin/calls/${c.id}/recording`} />
          )}
        </div>
      ))}
    </div>
  );
}

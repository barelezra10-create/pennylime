"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSessionHandlingStatus } from "@/actions/archive";
import type { HandlingStatus } from "@/lib/agent/session-status";

export function SessionStatusControls({
  sessionId,
  initialStatus,
}: {
  sessionId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<HandlingStatus | null>(null);

  async function set(next: HandlingStatus, label: string) {
    setBusy(next);
    try {
      const r = await setSessionHandlingStatus(sessionId, next);
      if (r.ok) {
        setStatus(next);
        toast.success(label);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">
        Status
      </span>
      <button
        type="button"
        onClick={() => set("RESOLVED", "Marked resolved")}
        disabled={busy !== null || status === "RESOLVED"}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50 ${
          status === "RESOLVED"
            ? "bg-[#bbf7d0] text-[#166534] ring-1 ring-[#22c55e]"
            : "bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]"
        }`}
      >
        {busy === "RESOLVED" ? "…" : "Mark resolved"}
      </button>
      {status !== "OPEN" && (
        <button
          type="button"
          onClick={() => set("OPEN", "Reopened")}
          disabled={busy !== null}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#71717a] hover:bg-[#f4f4f5] disabled:opacity-50"
        >
          {busy === "OPEN" ? "…" : "Reopen"}
        </button>
      )}
    </div>
  );
}

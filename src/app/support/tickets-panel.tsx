"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listSupportTickets,
  setTicketStatus,
  assignTicketToMe,
  type TicketRow,
} from "@/actions/tickets";

function shortAgent(email: string): string {
  return email.split("@")[0] || email;
}

type Filter = "open" | "mine" | "unassigned" | "closed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusChip({ status }: { status: string }) {
  const isOpen = status === "open";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
        isOpen
          ? "bg-red-100 text-red-700"
          : "bg-[#e4e4e7] text-[#71717a]"
      }`}
    >
      {status}
    </span>
  );
}

function TicketCard({
  ticket,
  me,
  onRefetch,
}: {
  ticket: TicketRow;
  me: string | null;
  onRefetch: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const isAssignedToMe = me && ticket.assignedTo === me;

  async function handleAssign(assign: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await assignTicketToMe(ticket.id, assign);
      if (!res.ok) {
        setError((res as { ok: false; error: string }).error ?? "Action failed");
      } else {
        onRefetch();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(status: "open" | "closed") {
    setBusy(true);
    setError(null);
    try {
      const res = await setTicketStatus(ticket.id, status);
      if (!res.ok) {
        setError((res as { ok: false; error: string }).error ?? "Action failed");
      } else {
        onRefetch();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white p-4 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] text-[#0a0a0a] leading-snug truncate">
            {ticket.reason}
          </div>
          {ticket.contactName && (
            <div className="text-[12px] text-[#71717a] mt-0.5">
              {ticket.contactName}
            </div>
          )}
          <div className="text-[11px] text-[#a1a1aa] mt-0.5">
            {timeAgo(ticket.createdAt)}
          </div>
        </div>
        <StatusChip status={ticket.status} />
      </div>

      {/* Assigned to */}
      {ticket.assignedTo && (
        <div className="text-[12px] text-[#3f3f46]">
          Assigned to:{" "}
          <span
            className={
              isAssignedToMe ? "font-bold text-[#15803d]" : "font-medium"
            }
          >
            {isAssignedToMe ? "you" : ticket.assignedTo}
          </span>
        </div>
      )}

      {/* Closed by */}
      {ticket.status === "closed" && ticket.closedBy && (
        <span className="inline-block rounded-full bg-[#f4f4f5] text-[#71717a] px-2 py-0.5 text-[10px] font-medium">
          Closed by {shortAgent(ticket.closedBy)}
        </span>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!isAssignedToMe ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleAssign(true)}
            className="px-3 py-1.5 rounded-lg bg-[#f4f4f5] text-[12px] font-semibold text-[#27272a] hover:bg-[#e4e4e7] disabled:opacity-50 transition-colors"
          >
            Assign to me
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleAssign(false)}
            className="px-3 py-1.5 rounded-lg bg-[#f4f4f5] text-[12px] font-semibold text-[#27272a] hover:bg-[#e4e4e7] disabled:opacity-50 transition-colors"
          >
            Unassign
          </button>
        )}

        {ticket.status === "open" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleStatus("closed")}
            className="px-3 py-1.5 rounded-lg bg-[#f4f4f5] text-[12px] font-semibold text-[#27272a] hover:bg-[#e4e4e7] disabled:opacity-50 transition-colors"
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleStatus("open")}
            className="px-3 py-1.5 rounded-lg bg-[#f4f4f5] text-[12px] font-semibold text-[#27272a] hover:bg-[#e4e4e7] disabled:opacity-50 transition-colors"
          >
            Reopen
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-[#f4f4f5] text-[12px] font-semibold text-[#27272a] hover:bg-[#e4e4e7] transition-colors"
        >
          {showTranscript ? "Hide transcript" : "View transcript"}
        </button>
      </div>

      {/* Inline error */}
      {error && (
        <div className="text-[12px] text-red-600">{error}</div>
      )}

      {/* Transcript */}
      {showTranscript && (
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-[#27272a] bg-[#f8f8f6] border border-[#e4e4e7] rounded-lg p-3 max-h-64 overflow-y-auto leading-relaxed">
          {ticket.transcript || "(no transcript)"}
        </pre>
      )}
    </div>
  );
}

export function TicketsPanel({ me }: { me: string | null }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await listSupportTickets(filter);
      setTickets(data);
    } catch {
      /* swallow */
    }
  }, [filter]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
              filter === f.key
                ? "bg-[#15803d] text-white"
                : "bg-white border border-[#e4e4e7] text-[#71717a] hover:text-black hover:border-[#a1a1aa]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-[#e4e4e7] bg-white p-8 text-center text-[13px] text-[#71717a]">
          No tickets
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              me={me}
              onRefetch={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

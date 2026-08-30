"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteApplicant, setApplicantStatus } from "@/actions/hr";

export type ApplicantRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
  yearsExperience: string | null;
  mcaExperience: boolean;
  message: string | null;
  role: string;
  cvUrl: string;
  cvFileName: string;
  status: string;
  invitedAt: string | null;
  proposedTimes: string | null;
  notes: string | null;
  createdAt: string;
};

const STATUSES = ["NEW", "REVIEWING", "INVITED", "REJECTED", "HIRED"] as const;
const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-[#eff6ff] text-[#1d4ed8]",
  REVIEWING: "bg-[#fefce8] text-[#a16207]",
  INVITED: "bg-[#f0fdf4] text-[#15803d]",
  REJECTED: "bg-[#fef2f2] text-[#b91c1c]",
  HIRED: "bg-[#15803d] text-white",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function HrClient({ rows }: { rows: ApplicantRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("ALL");
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [times, setTimes] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const list = useMemo(
    () => (filter === "ALL" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  async function changeStatus(id: string, status: (typeof STATUSES)[number]) {
    setBusyId(id);
    try {
      const r = await setApplicantStatus(id, status);
      if (r.ok) {
        toast.success(`Marked ${status.toLowerCase()}`);
        router.refresh();
      } else toast.error(r.error);
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvite(a: ApplicantRow) {
    if (!times.trim()) {
      toast.error("Add at least one proposed time.");
      return;
    }
    setBusyId(a.id);
    try {
      const r = await inviteApplicant({ id: a.id, proposedTimes: times, note });
      if (r.ok) {
        toast.success(`Interview invite sent to ${r.sentTo}`);
        setInviteId(null);
        setTimes("");
        setNote("");
        router.refresh();
      } else toast.error(r.error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              filter === s ? "bg-[#15803d] text-white" : "bg-white border border-[#e4e4e7] text-[#52525b] hover:bg-[#fafafa]"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()} · {counts[s] || 0}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-[#e4e4e7] bg-white p-10 text-center text-[13px] text-[#a1a1aa]">
          No applicants{filter === "ALL" ? " yet" : ` marked ${filter.toLowerCase()}`}.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <div key={a.id} className="rounded-xl border border-[#e4e4e7] bg-white p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-black">{a.fullName}</span>
                    {a.mcaExperience && (
                      <span className="inline-flex items-center rounded-full bg-[#15803d] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        MCA
                      </span>
                    )}
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[a.status] || "bg-[#f4f4f5] text-[#71717a]"}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-[#52525b] flex flex-wrap gap-x-3 gap-y-0.5">
                    <a href={`mailto:${a.email}`} className="text-[#15803d] hover:underline">{a.email}</a>
                    {a.phone && <span>{a.phone}</span>}
                    {a.linkedin && (
                      <a href={a.linkedin.startsWith("http") ? a.linkedin : `https://${a.linkedin}`} target="_blank" className="text-[#15803d] hover:underline">LinkedIn</a>
                    )}
                    {a.yearsExperience && <span>{a.yearsExperience} yrs exp</span>}
                    <span className="text-[#a1a1aa]">Applied {fmtDate(a.createdAt)}</span>
                  </div>
                  {a.message && <p className="mt-2 text-[12px] text-[#3f3f46] max-w-[640px] whitespace-pre-wrap">{a.message}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={a.cvUrl}
                    target="_blank"
                    className="rounded-md border border-[#15803d] text-[#15803d] hover:bg-[#f0fdf4] text-[11px] font-semibold px-2.5 py-1 transition-colors"
                  >
                    View CV
                  </a>
                  <button
                    onClick={() => { setInviteId(inviteId === a.id ? null : a.id); setTimes(""); setNote(""); }}
                    className="rounded-md bg-[#15803d] text-white hover:bg-[#166534] text-[11px] font-semibold px-2.5 py-1 transition-colors"
                  >
                    {a.status === "INVITED" ? "Invite again" : "Invite to interview"}
                  </button>
                </div>
              </div>

              {/* Invite panel */}
              {inviteId === a.id && (
                <div className="mt-3 rounded-lg bg-[#fafafa] border border-[#e4e4e7] p-3">
                  <label className="block text-[12px] font-semibold text-[#3f3f46] mb-1">Propose interview times (one per line)</label>
                  <textarea
                    value={times}
                    onChange={(e) => setTimes(e.target.value)}
                    rows={3}
                    placeholder={"Tue Sep 2, 10:00 AM ET\nWed Sep 3, 2:00 PM ET\nThu Sep 4, 11:30 AM ET"}
                    className="w-full rounded-md border border-[#e4e4e7] px-2.5 py-2 text-[13px] outline-none focus:border-[#15803d]"
                  />
                  <label className="block text-[12px] font-semibold text-[#3f3f46] mb-1 mt-2">Optional note</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. The call is a 30-minute video interview."
                    className="w-full rounded-md border border-[#e4e4e7] px-2.5 py-2 text-[13px] outline-none focus:border-[#15803d]"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => sendInvite(a)}
                      disabled={busyId === a.id}
                      className="rounded-md bg-[#15803d] text-white hover:bg-[#166534] text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50 transition-colors"
                    >
                      {busyId === a.id ? "Sending…" : "Send invite"}
                    </button>
                    <button
                      onClick={() => setInviteId(null)}
                      className="rounded-md border border-[#e4e4e7] text-[#52525b] hover:bg-white text-[12px] font-semibold px-3 py-1.5 transition-colors"
                    >
                      Cancel
                    </button>
                    {a.proposedTimes && a.status === "INVITED" && (
                      <span className="text-[11px] text-[#a1a1aa]">Previously sent {a.invitedAt ? fmtDate(a.invitedAt) : ""}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Status controls */}
              <div className="mt-3 flex items-center gap-1.5 flex-wrap border-t border-[#f4f4f5] pt-3">
                <span className="text-[11px] text-[#a1a1aa] mr-1">Set status:</span>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStatus(a.id, s)}
                    disabled={busyId === a.id || a.status === s}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                      a.status === s ? "bg-[#f4f4f5] text-[#71717a]" : "border border-[#e4e4e7] text-[#52525b] hover:bg-[#fafafa]"
                    }`}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

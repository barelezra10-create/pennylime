"use client";

// Read-only view of the collections/dunning script for one account: what has
// already been sent and what is scheduled next. Data is computed server-side
// (buildCollectionsTimeline) and passed in as plain JSON (dates as ISO strings).

export type CollectionsStep = {
  label: string;
  channel: string;
  date: string | null;
  note?: string;
};
export type CollectionsView = {
  status: string;
  outstanding: number;
  daysInCollections: number | null;
  sent: CollectionsStep[];
  upcoming: CollectionsStep[];
  bankBalance?: number | null;
  bankBalanceUpdatedAt?: string | null;
  hasPlaid?: boolean;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function money(n: number): string {
  return `$${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CollectionsTimeline({ view }: { view: CollectionsView | null }) {
  if (!view) return null;
  const hasAny = view.sent.length > 0 || view.upcoming.length > 0;
  if (!hasAny) return null;

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
            <svg className="h-5 w-5 text-[#b91c1c]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            Collections flow
          </h2>
          <p className="text-[11px] text-[#71717a] mt-0.5">
            Automated dunning emails and texts. What went out and what is queued next.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[18px] font-bold text-[#b91c1c] tabular-nums">{money(view.outstanding)}</div>
          <div className="text-[11px] text-[#71717a]">
            outstanding{view.daysInCollections != null ? ` · ${view.daysInCollections}d in collections` : ""}
          </div>
        </div>
      </div>

      {/* Live bank balance — refreshed daily so collections can see if there
          are funds to actually collect. */}
      {view.hasPlaid && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[12px] text-[#52525b]">
            <svg className="h-4 w-4 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
            </svg>
            Bank balance
          </div>
          <div className="text-right">
            <span
              className={`text-[15px] font-bold tabular-nums ${
                view.bankBalance != null && view.bankBalance >= view.outstanding
                  ? "text-[#15803d]"
                  : "text-[#0a0a0a]"
              }`}
            >
              {view.bankBalance != null ? money(view.bankBalance) : "n/a"}
            </span>
            <span className="ml-2 text-[11px] text-[#a1a1aa]">
              {view.bankBalanceUpdatedAt ? `updated ${timeAgo(view.bankBalanceUpdatedAt)}` : "not refreshed yet"}
            </span>
          </div>
        </div>
      )}

      {/* Upcoming */}
      {view.upcoming.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a1a1aa] mb-2">Scheduled next</p>
          <ul className="space-y-2">
            {view.upcoming.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-[#b91c1c] bg-white" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-[#0a0a0a]">{s.label}</span>
                    <span className="text-[11px] text-[#71717a] tabular-nums whitespace-nowrap">{fmtDate(s.date)}</span>
                  </div>
                  <div className="text-[11px] text-[#71717a]">
                    {s.channel}
                    {s.note ? ` · ${s.note}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sent */}
      {view.sent.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a1a1aa] mb-2">Already sent</p>
          <ul className="space-y-2">
            {view.sent
              .slice()
              .reverse()
              .map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-[#15803d] text-white flex items-center justify-center text-[9px]">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-[#52525b]">{s.label}</span>
                      <span className="text-[11px] text-[#a1a1aa] tabular-nums whitespace-nowrap">{fmtDate(s.date)}</span>
                    </div>
                    <div className="text-[11px] text-[#a1a1aa]">{s.channel}</div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

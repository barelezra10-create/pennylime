"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { toast } from "sonner";
import {
  getInboxMessage,
  setInboxStatus,
  convertInboxToContact,
  type InboxRow,
  type InboxFilter,
  type InboxMessageDetail,
} from "@/actions/inbox";

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "UNREAD", label: "Unread" },
  { id: "UNMATCHED", label: "Strangers" },
  { id: "MATCHED", label: "From contacts" },
  { id: "ARCHIVED", label: "Archived" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InboxClient({
  initialRows,
  counts,
  filter,
}: {
  initialRows: InboxRow[];
  counts: { unread: number; unmatched: number };
  filter: InboxFilter;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [, startTransition] = useTransition();

  async function openMessage(id: string) {
    setOpenId(id);
    setLoadingDetail(true);
    setDetail(null);
    const m = await getInboxMessage(id);
    setDetail(m);
    setLoadingDetail(false);
    // Refresh list in background so the row's status updates to READ.
    startTransition(() => router.refresh());
  }

  async function handleArchive(id: string) {
    const r = await setInboxStatus(id, "ARCHIVED");
    if (r.ok) {
      toast.success("Archived");
      setOpenId(null);
      setDetail(null);
      startTransition(() => router.refresh());
    } else {
      toast.error(r.error);
    }
  }

  async function handleMarkUnread(id: string) {
    const r = await setInboxStatus(id, "UNREAD");
    if (r.ok) {
      toast.success("Marked unread");
      setOpenId(null);
      setDetail(null);
      startTransition(() => router.refresh());
    } else {
      toast.error(r.error);
    }
  }

  async function handleCreateContact(id: string) {
    const r = await convertInboxToContact(id);
    if (r.ok) {
      toast.success("Contact created");
      router.push(`/admin/contacts/${r.contactId}`);
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div>
      <PageHeader title="Inbox" description="Every email that landed at info@pennylime.com. Customers + strangers." />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map((f) => {
          const isActive = filter === f.id;
          const badge =
            f.id === "UNREAD" ? counts.unread :
            f.id === "UNMATCHED" ? counts.unmatched :
            null;
          return (
            <Link
              key={f.id}
              href={`/admin/inbox?filter=${f.id}`}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                isActive ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {f.label}
              {badge !== null && badge > 0 ? (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full text-[10px] font-bold ${isActive ? "bg-white text-[#15803d]" : "bg-[#15803d] text-white"}`}>
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-4">
        {/* List */}
        <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
          {initialRows.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-[#71717a]">
              No messages in this view.
            </div>
          ) : (
            <ul className="divide-y divide-[#f4f4f5] max-h-[calc(100vh-220px)] overflow-y-auto">
              {initialRows.map((row) => {
                const isUnread = row.status === "UNREAD";
                const isOpen = openId === row.id;
                const displayName = row.fromName || row.fromEmail.split("@")[0];
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openMessage(row.id)}
                      className={`w-full text-left px-4 py-3.5 hover:bg-[#fafafa] transition-colors ${isOpen ? "bg-[#f0fdf4]" : ""} ${isUnread && !isOpen ? "bg-[#f0fdf4]/40" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {isUnread ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#15803d] flex-shrink-0" />
                          ) : null}
                          <span className={`truncate text-[13px] ${isUnread ? "font-bold text-black" : "font-semibold text-[#52525b]"}`}>
                            {displayName}
                          </span>
                          {row.contact ? (
                            <span className="inline-flex items-center rounded-full bg-[#f0fdf4] text-[#15803d] text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 flex-shrink-0">
                              contact
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 flex-shrink-0">
                              stranger
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#a1a1aa] flex-shrink-0 tabular-nums">{fmtDate(row.receivedAt)}</span>
                      </div>
                      <div className={`truncate text-[12px] ${isUnread ? "font-semibold text-[#27272a]" : "text-[#71717a]"}`}>
                        {row.subject}
                      </div>
                      <div className="truncate text-[11px] text-[#a1a1aa] mt-0.5">
                        {row.preview}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail pane */}
        <div className="bg-white rounded-xl border border-[#e4e4e7]">
          {!openId ? (
            <div className="p-16 text-center">
              <svg className="w-12 h-12 mx-auto text-[#d4d4d8] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <p className="text-[13px] text-[#a1a1aa]">Pick a message to read.</p>
            </div>
          ) : loadingDetail || !detail ? (
            <div className="p-16 text-center text-[13px] text-[#a1a1aa]">Loading...</div>
          ) : (
            <div className="flex flex-col h-full max-h-[calc(100vh-180px)]">
              <div className="border-b border-[#e4e4e7] p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <h2 className="text-[18px] font-bold tracking-tight text-black">{detail.subject}</h2>
                    <p className="mt-1 text-[13px] text-[#52525b]">
                      <span className="font-semibold">{detail.fromName || detail.fromEmail.split("@")[0]}</span>
                      <span className="text-[#71717a] ml-1">&lt;{detail.fromEmail}&gt;</span>
                      <span className="text-[#a1a1aa] ml-2">· {new Date(detail.receivedAt).toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {detail.contact ? (
                    <Link
                      href={`/admin/contacts/${detail.contact.id}?tab=email`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[12px] font-semibold px-3 py-1.5"
                    >
                      Open in CRM →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateContact(detail.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[12px] font-semibold px-3 py-1.5"
                    >
                      + Create contact
                    </button>
                  )}
                  <a
                    href={`mailto:${detail.fromEmail}?subject=Re:%20${encodeURIComponent(detail.subject)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white text-black text-[12px] font-semibold px-3 py-1.5 hover:bg-[#fafafa]"
                  >
                    Reply via mail client
                  </a>
                  <button
                    type="button"
                    onClick={() => handleMarkUnread(detail.id)}
                    className="text-[12px] text-[#71717a] hover:text-black font-semibold px-2 py-1.5"
                  >
                    Mark unread
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchive(detail.id)}
                    className="text-[12px] text-red-700 hover:text-red-900 font-semibold px-2 py-1.5"
                  >
                    Archive
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {detail.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-[13px] text-[#27272a] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-[#27272a] leading-relaxed">
                    {detail.bodyText || "(empty)"}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

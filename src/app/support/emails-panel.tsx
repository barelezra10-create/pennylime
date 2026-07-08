"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getInbox,
  getInboxMessage,
  setInboxStatus,
  replyToInboundEmail,
  type InboxRow,
  type InboxMessageDetail,
  type InboxFilter,
} from "@/actions/inbox";

type UiFilter = "Unread" | "All" | "Replied" | "Archived";

const UI_TO_API: Record<UiFilter, InboxFilter> = {
  Unread: "UNREAD",
  All: "ALL",
  Replied: "REPLIED",
  Archived: "ARCHIVED",
};

const UI_FILTERS: UiFilter[] = ["Unread", "All", "Replied", "Archived"];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function EmailsPanel() {
  const [uiFilter, setUiFilter] = useState<UiFilter>("Unread");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxMessageDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const data = await getInbox(UI_TO_API[uiFilter]);
      setRows(data);
    } catch {
      /* swallow */
    }
  }, [uiFilter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await getInboxMessage(id);
      setDetail(data);
    } catch {
      /* swallow */
    }
  }, []);

  // Reload list when filter changes; also set up 30s poll
  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    loadList();
    const interval = setInterval(loadList, 30_000);
    return () => clearInterval(interval);
  }, [loadList]);

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setReplyText("");
    setReplyError(null);
    setReplySuccess(false);
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handleArchive(id: string) {
    await setInboxStatus(id, "ARCHIVED");
    await loadList();
    if (selectedId === id) setSelectedId(null);
  }

  async function handleMarkUnread(id: string) {
    await setInboxStatus(id, "UNREAD");
    await loadList();
    // Close the pane instead of reloading: getInboxMessage auto-flips an
    // UNREAD email back to READ, which would undo the action.
    if (selectedId === id) setSelectedId(null);
  }

  async function handleSendReply() {
    if (!detail || !replyText.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await replyToInboundEmail(detail.id, replyText);
      if (!res.ok) {
        setReplyError((res as { ok: false; error: string }).error ?? "Send failed");
      } else {
        setReplySuccess(true);
        setReplyText("");
        await loadList();
        await loadDetail(detail.id);
      }
    } catch {
      setReplyError("An unexpected error occurred");
    } finally {
      setReplySending(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-[#e4e4e7] bg-white overflow-hidden flex"
      style={{ height: "calc(100vh - 230px)", minHeight: 420 }}
    >
      {/* Left pane */}
      <div
        className="flex flex-col border-r border-[#e4e4e7] flex-shrink-0"
        style={{ width: 300 }}
      >
        {/* Filter pills */}
        <div className="flex gap-1 p-3 border-b border-[#e4e4e7] flex-wrap">
          {UI_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setUiFilter(f)}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                uiFilter === f
                  ? "bg-[#15803d] text-white"
                  : "bg-[#f4f4f5] text-[#71717a] hover:text-black"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#71717a]">No emails</div>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`w-full text-left px-4 py-3 border-b border-[#e4e4e7] hover:bg-[#f4f4f5] transition-colors ${
                  selectedId === row.id ? "bg-[#f0fdf4]" : ""
                }`}
              >
                <div
                  className={`text-[13px] truncate ${
                    row.status === "UNREAD"
                      ? "font-bold text-[#0a0a0a]"
                      : "font-medium text-[#3f3f46]"
                  }`}
                >
                  {row.fromName || row.fromEmail}
                </div>
                <div
                  className={`text-[12px] truncate mt-0.5 ${
                    row.status === "UNREAD"
                      ? "font-semibold text-[#27272a]"
                      : "text-[#71717a]"
                  }`}
                >
                  {row.subject}
                </div>
                <div className="text-[11px] text-[#a1a1aa] mt-0.5">
                  {timeAgo(row.receivedAt)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-[#71717a]">
            {selectedId ? "Loading..." : "Select an email to read"}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#e4e4e7] flex-shrink-0">
              <div className="font-semibold text-[15px] text-[#0a0a0a] leading-tight">
                {detail.subject}
              </div>
              <div className="text-[12px] text-[#71717a] mt-1">
                From:{" "}
                <span className="font-medium text-[#3f3f46]">
                  {detail.fromName
                    ? `${detail.fromName} <${detail.fromEmail}>`
                    : detail.fromEmail}
                </span>
              </div>
              <div className="text-[12px] text-[#71717a]">
                Received:{" "}
                {new Date(detail.receivedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => handleMarkUnread(detail.id)}
                  className="text-[12px] text-[#15803d] hover:text-[#166534] font-semibold px-2 py-1.5"
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

            {/* Body */}
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

            {/* Reply composer */}
            <div className="border-t border-[#e4e4e7] p-4 flex-shrink-0">
              {replySuccess && (
                <div className="mb-2 text-[13px] font-semibold text-[#15803d]">
                  Replied successfully
                </div>
              )}
              <textarea
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  if (replySuccess) setReplySuccess(false);
                }}
                placeholder="Write a reply..."
                rows={4}
                className="w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px] text-[#0a0a0a] placeholder-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d] resize-none"
              />
              {replyError && (
                <div className="mt-1 text-[12px] text-red-600">{replyError}</div>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={replySending || !replyText.trim()}
                  onClick={handleSendReply}
                  className="px-4 py-2 rounded-lg bg-[#15803d] text-white text-[13px] font-semibold disabled:opacity-50 hover:bg-[#166534] transition-colors"
                >
                  {replySending ? "Sending..." : "Send reply"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

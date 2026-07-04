"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  listChatConversations,
  getChatConversation,
  sendChatAdminReply,
  releaseChatSession,
  archiveChatSession,
  unarchiveChatSession,
  type ChatConversationRow,
  type ChatThreadItem,
} from "@/actions/agent-chat";
import { sortConversations } from "./sort-conversations";

type Filter = "needs-reply" | "open" | "all" | "archived";
type Thread = NonNullable<Awaited<ReturnType<typeof getChatConversation>>>;
type SortedRow = ChatConversationRow & { lastMessageAtMs: number };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "needs-reply", label: "Needs reply" },
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "archived", label: "Archived" },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function ChatsClient() {
  const [filter, setFilter] = useState<Filter>("needs-reply");
  const [rows, setRows] = useState<SortedRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const lastItemIsoRef = useRef<string | null>(null);

  const loadList = useCallback((f: Filter) => {
    listChatConversations(f)
      .then((r) =>
        setRows(
          sortConversations(
            r.map((row) => ({
              ...row,
              lastMessageAtMs: row.lastMessage ? new Date(row.lastMessage.at).getTime() : new Date(row.startedAt).getTime(),
            }))
          )
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRows(null);
    loadList(filter);
    const t = setInterval(() => loadList(filter), 10_000);
    return () => clearInterval(t);
  }, [filter, loadList]);

  const isAtBottom = () => {
    const el = scrollBoxRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const appendDelta = useCallback((id: string, smooth: boolean) => {
    getChatConversation(id, lastItemIsoRef.current ?? undefined)
      .then((delta) => {
        if (selectedRef.current !== id || !delta) return;
        // Capture appended items outside the updater so side effects run after setState,
        // keeping the updater pure (both strict-mode invocations produce the same appended value).
        let appended: ChatThreadItem[] = [];
        setThread((cur) => {
          if (!cur) return cur;
          const seen = new Set(cur.items.map((i) => i.id));
          appended = delta.items.filter((i) => !seen.has(i.id));
          return { session: delta.session, items: appended.length ? [...cur.items, ...appended] : cur.items };
        });
        // Note: lastItemIsoRef cursor uses strictly-greater createdAt; an item sharing the
        // exact same millisecond as the cursor could be skipped (acceptable at chat volume).
        if (appended.length) {
          lastItemIsoRef.current = appended[appended.length - 1].createdAt;
          if (isAtBottom()) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" }), 30);
        }
      })
      .catch(() => {});
  }, []);

  const openThread = useCallback((id: string) => {
    setSelectedId(id);
    setThread(null);
    setDraft("");
    setSendError(null);
    lastItemIsoRef.current = null;
    getChatConversation(id)
      .then((t) => {
        if (selectedRef.current !== id || !t) return;
        setThread(t);
        lastItemIsoRef.current = t.items.length ? t.items[t.items.length - 1].createdAt : null;
        setTimeout(() => bottomRef.current?.scrollIntoView(), 30);
      })
      .catch(() => {});
  }, []);

  // Live thread poll every 3s.
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => appendDelta(selectedId, true), 3_000);
    return () => clearInterval(t);
  }, [selectedId, appendDelta]);

  const send = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const res = await sendChatAdminReply({ sessionId: selectedId, text: draft });
    setSending(false);
    if (!res.ok) {
      setSendError(res.error || "Could not send.");
      return;
    }
    setDraft("");
    appendDelta(selectedId, true);
    loadList(filter);
  };

  const toggleArchive = async () => {
    if (!thread || !selectedId) return;
    if (thread.session.archived) await unarchiveChatSession(selectedId);
    else await archiveChatSession(selectedId);
    openThread(selectedId);
    loadList(filter);
  };

  const handBackToAI = async () => {
    if (!selectedId) return;
    await releaseChatSession(selectedId);
    openThread(selectedId);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)] min-h-[480px]">
      {/* List pane */}
      <div className={`lg:w-[360px] w-full flex flex-col ${selectedId ? "hidden lg:flex" : "flex"}`}>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium border ${
                filter === f.key ? "bg-[#18181b] text-white border-[#18181b]" : "bg-white text-[#3f3f46] border-[#e4e4e7]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl border border-[#e4e4e7] bg-white divide-y divide-[#f4f4f5]">
          {rows === null && <p className="p-4 text-[13px] text-[#71717a]">Loading...</p>}
          {rows?.length === 0 && (
            <p className="p-4 text-[13px] text-[#71717a]">
              {filter === "needs-reply" ? "No one is waiting. Nice." : "No conversations."}
            </p>
          )}
          {rows?.map((r) => (
            <button
              key={r.id}
              onClick={() => openThread(r.id)}
              className={`w-full text-left p-3 hover:bg-[#fafafa] ${selectedId === r.id ? "bg-[#eff6ff]" : ""}`}
            >
              <div className="flex items-center gap-2">
                {r.online && <span className="h-2 w-2 rounded-full bg-[#15803d] shrink-0" />}
                <span className="text-[13px] font-semibold text-[#18181b] truncate">{r.name}</span>
                <span
                  className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    r.mode === "human" ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f4f4f5] text-[#71717a]"
                  }`}
                >
                  {r.mode === "human" ? "You" : "AI"}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[12px] text-[#71717a] truncate flex-1">
                  {r.lastMessage ? `${r.lastMessage.authoredBy === "user" ? "" : r.lastMessage.authoredBy === "admin" ? "You: " : "AI: "}${r.lastMessage.text}` : "No messages"}
                </p>
                <span className="text-[11px] text-[#a1a1aa] shrink-0">{r.lastMessage ? timeAgo(r.lastMessage.at) : timeAgo(r.startedAt)}</span>
              </div>
              {r.needsReply && r.waitingSinceMs != null && (
                <span className="inline-block mt-1 rounded-full bg-[#fef2f2] text-[#dc2626] px-2 py-0.5 text-[10px] font-bold">
                  Waiting {timeAgo(new Date(r.waitingSinceMs).toISOString())}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thread pane */}
      <div className={`flex-1 flex-col rounded-xl border border-[#e4e4e7] bg-white overflow-hidden ${selectedId ? "flex" : "hidden lg:flex"}`}>
        {!selectedId && (
          <div className="flex-1 flex items-center justify-center text-[13px] text-[#71717a]">Pick a conversation.</div>
        )}
        {selectedId && thread === null && (
          <div className="flex-1 flex items-center justify-center text-[13px] text-[#71717a]">Loading conversation...</div>
        )}
        {selectedId && thread && (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f4f4f5]">
              <button onClick={() => setSelectedId(null)} className="lg:hidden text-[#71717a] text-[16px] mr-1" aria-label="Back">
                &#8592;
              </button>
              {thread.session.online && <span className="h-2 w-2 rounded-full bg-[#15803d]" />}
              <span className="text-[14px] font-semibold text-[#18181b]">{thread.session.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  thread.session.mode === "human" ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f4f4f5] text-[#71717a]"
                }`}
              >
                {thread.session.mode === "human" ? "You are live, AI paused" : "AI answering"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {thread.session.contactId && (
                  <Link href={`/admin/contacts/${thread.session.contactId}`} className="text-[12px] text-[#2563eb] hover:underline">
                    Open contact
                  </Link>
                )}
                {thread.session.mode === "human" && !thread.session.archived && (
                  <button onClick={handBackToAI} className="text-[12px] text-[#3f3f46] border border-[#e4e4e7] rounded-lg px-2 py-1 hover:bg-[#fafafa]">
                    Hand back to AI
                  </button>
                )}
                <button onClick={toggleArchive} className="text-[12px] text-[#3f3f46] border border-[#e4e4e7] rounded-lg px-2 py-1 hover:bg-[#fafafa]">
                  {thread.session.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
            </div>

            <div ref={scrollBoxRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {thread.items.map((item, i) => {
                const prev = i > 0 ? thread.items[i - 1] : null;
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(item.createdAt);
                return (
                  <div key={item.id}>
                    {newDay && (
                      <div className="text-center my-3">
                        <span className="text-[11px] text-[#a1a1aa] bg-[#fafafa] rounded-full px-3 py-1">{dayLabel(item.createdAt)}</span>
                      </div>
                    )}
                    {item.kind === "tool" ? <ToolLine item={item} /> : <MessageBubble item={item} />}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[#f4f4f5] p-3">
              {thread.session.archived ? (
                <p className="text-[12px] text-[#71717a]">
                  Archived conversation.{" "}
                  <button onClick={toggleArchive} className="text-[#2563eb] hover:underline">Unarchive to reply</button>
                </p>
              ) : (
                <>
                  {sendError && <p className="text-[12px] text-[#dc2626] mb-1">{sendError}</p>}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={Math.min(5, Math.max(1, draft.split("\n").length))}
                      placeholder={thread.session.mode === "ai" ? "Reply (this takes over from the AI)..." : "Reply..."}
                      className="flex-1 resize-none rounded-xl border border-[#e4e4e7] px-3 py-2 text-[14px]"
                    />
                    <button
                      onClick={send}
                      disabled={sending || !draft.trim()}
                      className="rounded-xl bg-[#15803d] text-white px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
                    >
                      {sending ? "..." : "Send"}
                    </button>
                  </div>
                  {!thread.session.online && (
                    <p className="text-[11px] text-[#a1a1aa] mt-1">Visitor is offline; your reply will also be emailed to them.</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ item }: { item: Extract<ChatThreadItem, { kind: "message" }> }) {
  const mine = item.authoredBy === "admin";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        <div
          className={`rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
            mine
              ? "bg-[#15803d] text-white rounded-br-md"
              : item.authoredBy === "ai"
                ? "bg-white border border-[#e4e4e7] text-[#18181b] rounded-bl-md"
                : "bg-[#f4f4f5] text-[#18181b] rounded-bl-md"
          }`}
        >
          {item.authoredBy === "ai" && <span className="block text-[10px] font-semibold text-[#a1a1aa] mb-0.5">AI</span>}
          {item.text}
        </div>
        <p className={`text-[10px] text-[#a1a1aa] mt-0.5 ${mine ? "text-right" : ""}`}>
          {hhmm(item.createdAt)}
          {item.emailed && " (also sent by email)"}
        </p>
      </div>
    </div>
  );
}

function ToolLine({ item }: { item: Extract<ChatThreadItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-center">
      <button onClick={() => setOpen(!open)} className="text-[11px] text-[#a1a1aa] hover:text-[#71717a]">
        AI ran {item.name} {item.status !== "ok" ? `(${item.status})` : ""} {open ? "▴" : "▾"}
      </button>
      {open && item.summary && <p className="text-[11px] text-[#71717a] mt-0.5">{item.summary}</p>}
    </div>
  );
}

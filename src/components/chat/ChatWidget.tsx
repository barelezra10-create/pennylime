"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, type ChatMsg } from "./merge-messages";

const SESSION_KEY = "pennylime.chat.session";
const LEAD_KEY = "pennylime.chat.lead";
const LAST_SEEN_KEY = "pennylime.chat.lastSeen";
const BRAND_GREEN = "#15803d";
const POLL_OPEN_MS = 2500;
const POLL_CLOSED_MS = 20000;

type Lead = { firstName: string; email: string };

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [text, setText] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [unread, setUnread] = useState(0);
  const [identified, setIdentified] = useState(false);
  const [leadFirst, setLeadFirst] = useState("");
  const [leadEmailVal, setLeadEmailVal] = useState("");
  const [leadErr, setLeadErr] = useState<string | null>(null);
  const [humanDelivered, setHumanDelivered] = useState(false);

  // Refs — mutated without re-renders
  const sessionIdRef = useRef<string | null>(null);
  const lastMsgIdRef = useRef<string>("");
  const inFlightRef = useRef(false);
  const openRef = useRef(false);
  const hasMessagesRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Set inside polling effect so post-send trigger can cancel+restart the timer
  const triggerPollRef = useRef<(() => void) | null>(null);
  // Guards the one-per-open portal probe (resets when panel closes)
  const probeFiredRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { hasMessagesRef.current = messages.length > 0; }, [messages]);

  // When the panel opens with no local-lead email and not yet identified,
  // probe the portal cookie once. On a hit we skip the intro gate without
  // creating an empty AgentSession in the admin inbox.
  useEffect(() => {
    if (!open) {
      // Reset so the next open can probe again.
      probeFiredRef.current = false;
      return;
    }
    if (identified || lead?.email || probeFiredRef.current) return;
    probeFiredRef.current = true;
    let cancelled = false;
    fetch("/api/agent/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: true }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { identified?: boolean; visitorName?: string | null } | null) => {
        if (cancelled || !data) return;
        if (data.identified === true) setIdentified(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, identified, lead]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedSid = localStorage.getItem(SESSION_KEY);
      const storedLead = localStorage.getItem(LEAD_KEY);
      if (storedSid) { setSessionId(storedSid); sessionIdRef.current = storedSid; }
      if (storedLead) {
        try {
          const parsed = JSON.parse(storedLead) as Lead;
          setLead(parsed);
          if (parsed?.email) setIdentified(true);
        } catch {}
      }
    } catch {}
  }, []);

  // Auto-scroll thread when messages or typing indicator changes
  const scrollToBottom = useCallback((force = false) => {
    const el = threadRef.current;
    if (!el) return;
    if (force || atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isAiTyping, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // Textarea auto-grow (max 5 rows)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [text]);

  // Core poll — uses refs so it never goes stale
  const doPoll = useCallback(async (passive: boolean) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          sinceMessageId: lastMsgIdRef.current,
          ...(passive ? { passive: true } : {}),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        mode?: string;
        messages?: ChatMsg[];
        identified?: boolean;
        visitorName?: string | null;
      };
      if (data.mode) setMode(data.mode as "ai" | "human");
      if (data.identified === true) setIdentified(true);
      const incoming: ChatMsg[] = Array.isArray(data.messages) ? data.messages : [];
      if (incoming.length > 0) {
        lastMsgIdRef.current = incoming[incoming.length - 1].id;
        setMessages((prev) => mergeMessages(prev, incoming));
        if (openRef.current) {
          try { localStorage.setItem(LAST_SEEN_KEY, lastMsgIdRef.current); } catch {}
        } else {
          const newNonUser = incoming.filter((m) => m.authoredBy !== "user").length;
          if (newNonUser > 0) setUnread((u) => u + newNonUser);
        }
      }
    } catch {
      // Network error; retry next interval
    }
  }, []);

  // Polling scheduler — restarts on open/sessionId change
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      handle = setTimeout(async () => {
        if (cancelled) return;
        await doPoll(!openRef.current);
        if (!cancelled) schedule(openRef.current ? POLL_OPEN_MS : POLL_CLOSED_MS);
      }, delay);
    };

    const runNow = async () => {
      if (open && !hasMessagesRef.current) setHydrating(true);
      await doPoll(!open);
      if (cancelled) return;
      if (open) setHydrating(false);
      schedule(open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    };

    // Expose trigger so send() can fire an immediate follow-up poll
    triggerPollRef.current = () => {
      if (handle) { clearTimeout(handle); handle = null; }
      if (!cancelled) {
        doPoll(false).then(() => {
          if (!cancelled) schedule(POLL_OPEN_MS);
        });
      }
    };

    runNow();

    return () => {
      cancelled = true;
      if (handle) clearTimeout(handle);
      triggerPollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setUnread(0);
    try {
      if (lastMsgIdRef.current) localStorage.setItem(LAST_SEEN_KEY, lastMsgIdRef.current);
    } catch {}
    // Small delay so the panel mounts before we scroll
    setTimeout(() => scrollToBottom(true), 60);
  }, [scrollToBottom]);

  // Send a user message
  async function send() {
    const t = text.trim();
    if (!t || inFlightRef.current) return;
    inFlightRef.current = true;
    setText("");

    const tmpId = `tmp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tmpId,
      text: t,
      authoredBy: "user",
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    if (mode === "ai") setIsAiTyping(true);

    try {
      const body: Record<string, unknown> = {
        text: t,
        sessionId: sessionIdRef.current,
      };
      if (lead) { body.leadFirstName = lead.firstName; body.leadEmail = lead.email; }

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        mode?: string;
        reply?: string | null;
        identified?: boolean;
        visitorName?: string | null;
      };

      // Persist new session id
      if (data.sessionId && !sessionIdRef.current) {
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
        try { localStorage.setItem(SESSION_KEY, data.sessionId); } catch {}
      }
      if (data.mode) setMode(data.mode as "ai" | "human");
      if (data.mode === "human" && !humanDelivered) setHumanDelivered(true);
      if (data.identified === true) setIdentified(true);

      setIsAiTyping(false);
      // Fire an immediate poll: confirms user message + fetches AI reply
      triggerPollRef.current?.();
    } catch {
      // Mark optimistic as failed so user can retry
      setMessages((prev) =>
        prev.map((m) => m.id === tmpId ? { ...m, failed: true, pending: false } : m),
      );
      setIsAiTyping(false);
    } finally {
      inFlightRef.current = false;
    }
  }

  function retryMessage(msg: ChatMsg) {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    setText(msg.text);
    textareaRef.current?.focus();
  }

  // Intro gate submission: validate, save locally, reveal composer, then fire API best-effort
  async function submitIntro(e: React.FormEvent) {
    e.preventDefault();
    setLeadErr(null);
    const firstName = leadFirst.trim();
    const email = leadEmailVal.trim();
    if (!firstName) { setLeadErr("Please share your name."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setLeadErr("Please enter a valid email."); return; }
    // Save locally and reveal composer immediately; gate unmounts on next render.
    const captured: Lead = { firstName, email };
    setLead(captured);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(captured)); } catch {}
    setIdentified(true);
    // Fire API best-effort; next send() carries lead fields if this fails.
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          leadFirstName: firstName,
          leadEmail: email,
        }),
      });
      const data = (await res.json()) as { sessionId?: string; identified?: boolean };
      if (data.sessionId && !sessionIdRef.current) {
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
        try { localStorage.setItem(SESSION_KEY, data.sessionId); } catch {}
      }
    } catch {
      // Local save already done; composer already revealed; next send carries fields.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Annotate consecutive same-author runs
  const grouped = messages.map((m, i) => ({
    ...m,
    isGroupStart: i === 0 || messages[i - 1].authoredBy !== m.authoredBy,
    isGroupEnd: i === messages.length - 1 || messages[i + 1].authoredBy !== m.authoredBy,
  }));

  // Button enabled only when both fields pass local validation
  const isIntroValid =
    leadFirst.trim().length > 0 && /^\S+@\S+\.\S+$/.test(leadEmailVal);

  return (
    <>
      {/* Launcher — shown only when panel is closed */}
      {!open && (
        <button
          aria-label="Open chat"
          onClick={handleOpen}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-white shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          style={{ backgroundColor: BRAND_GREEN, position: "fixed" }}
        >
          {/* Chat bubble icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 13.86 13.86 0 01-.001 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="hidden text-sm font-semibold sm:inline">Chat with us</span>

          {/* Unread badge */}
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Panel — mobile full-screen, desktop fixed card */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[560px] sm:w-[380px] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl">

          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            <div>
              <p className="text-sm font-bold leading-tight text-white">PennyLime Support</p>
              <p className="text-xs text-green-200">
                {mode === "human" ? "Live agent" : "AI assistant"}
              </p>
            </div>
            <button
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-white hover:bg-green-700 focus-visible:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Message thread — always visible so history is readable above the gate */}
          <div
            ref={threadRef}
            onScroll={handleScroll}
            className="flex flex-1 flex-col overflow-y-auto bg-gray-50 px-3 py-3"
          >
            {/* Loading shimmer while hydrating existing session */}
            {hydrating && (
              <div className="flex flex-col gap-3">
                {[72, 55, 80, 48].map((w, i) => (
                  <div
                    key={i}
                    className={[
                      "h-8 animate-pulse rounded-2xl bg-gray-200",
                      i % 2 !== 0 ? "self-end" : "self-start",
                    ].join(" ")}
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!hydrating && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-6 w-6 text-green-700"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 13.86 13.86 0 01-.001 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Hi{lead ? ` ${lead.firstName}` : ""}! How can we help?
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Ask about how PennyLime works, eligibility, rates, or repayment.
                  </p>
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {!hydrating &&
              grouped.map((m) => {
                const isUser = m.authoredBy === "user";
                const isAdmin = m.authoredBy === "admin";
                return (
                  <div
                    key={m.id}
                    className={[
                      "flex flex-col",
                      isUser ? "items-end" : "items-start",
                      m.isGroupStart ? "mt-4" : "mt-0.5",
                    ].join(" ")}
                  >
                    {/* "PennyLime team" label for first admin bubble in a run */}
                    {isAdmin && m.isGroupStart && (
                      <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        PennyLime team
                      </span>
                    )}

                    {/* Bubble — button so failed state is tappable */}
                    <button
                      type="button"
                      onClick={m.failed ? () => retryMessage(m) : undefined}
                      disabled={!m.failed}
                      className={[
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap",
                        isUser
                          ? "rounded-br-sm text-white"
                          : isAdmin
                          ? "rounded-bl-sm border border-green-200 bg-green-50 text-gray-900"
                          : "rounded-bl-sm border border-gray-200 bg-white text-gray-900",
                        m.failed ? "cursor-pointer opacity-50" : "cursor-default",
                      ].join(" ")}
                      style={isUser ? { backgroundColor: BRAND_GREEN } : undefined}
                    >
                      {m.text}
                      {m.failed && (
                        <span className="mt-1 block text-[10px] opacity-70">
                          Failed. Tap to retry.
                        </span>
                      )}
                    </button>

                    {/* Timestamp or status */}
                    <span className="mt-0.5 text-[10px] text-gray-400">
                      {m.pending && !m.failed
                        ? "Sending..."
                        : m.failed
                        ? ""
                        : fmtTime(m.createdAt)}
                    </span>
                  </div>
                );
              })}

            {/* Three-dot typing indicator while AI is working */}
            {isAiTyping && (
              <div className="mt-4 flex items-start">
                <div className="flex gap-1.5 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3.5">
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Required intro gate — shown when visitor is not yet identified */}
          {!identified ? (
            <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-5">
              <p className="mb-3 text-sm text-gray-600">
                Before we start, tell us who you are so we can help with your file.
              </p>
              <form onSubmit={submitIntro} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">First name</span>
                  <input
                    value={leadFirst}
                    onChange={(e) => setLeadFirst(e.target.value)}
                    placeholder="First name"
                    className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">Email</span>
                  <input
                    type="email"
                    value={leadEmailVal}
                    onChange={(e) => setLeadEmailVal(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
                  />
                </label>
                {leadErr && <p className="text-xs text-red-600">{leadErr}</p>}
                <button
                  type="submit"
                  disabled={!isIntroValid}
                  className="mt-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: BRAND_GREEN }}
                >
                  Start chat
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* One-time "Delivered" note in human mode */}
              {humanDelivered && mode === "human" && (
                <div className="shrink-0 border-t border-gray-100 bg-green-50 px-4 py-2 text-center text-xs text-green-700">
                  Delivered. The team replies right here.
                </div>
              )}

              {/* Composer */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={
                      mode === "human" ? "Type a message to the team..." : "Ask a question..."
                    }
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
                    style={{ maxHeight: "120px", overflowY: "auto" }}
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={!text.trim()}
                    aria-label="Send"
                    className="shrink-0 rounded-xl p-2.5 text-white disabled:opacity-40"
                    style={{ backgroundColor: BRAND_GREEN }}
                  >
                    {/* Paper-plane icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

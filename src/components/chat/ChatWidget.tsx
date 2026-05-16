"use client";

import { useEffect, useRef, useState } from "react";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  authoredBy?: "user" | "ai" | "admin";
  text: string;
};

const SESSION_KEY = "pennylime.chat.session";
const LEAD_KEY = "pennylime.chat.lead";
const POLL_INTERVAL_MS = 4000;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [lead, setLead] = useState<{ firstName: string; email: string } | null>(null);
  const [leadFirst, setLeadFirst] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadErr, setLeadErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedSid = window.localStorage.getItem(SESSION_KEY);
    const storedLead = window.localStorage.getItem(LEAD_KEY);
    if (storedSid) setSessionId(storedSid);
    if (storedLead) {
      try {
        setLead(JSON.parse(storedLead));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  // Poll for new messages (admin replies during human-takeover mode,
  // or any out-of-band assistant messages). Only when widget is open
  // and we have a session.
  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sinceMessageId: lastMessageIdRef.current }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.mode) setMode(data.mode);
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id).filter(Boolean));
            const fresh = data.messages.filter((m: Msg) => !seen.has(m.id));
            return [...prev, ...fresh];
          });
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
        }
      } catch {
        // ignore; will retry next tick
      }
    };
    const handle = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [open, sessionId]);

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadErr(null);
    if (!leadFirst.trim()) {
      setLeadErr("Please share your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
      setLeadErr("Please enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadFirstName: leadFirst,
          leadEmail,
          // No text yet — just starting the session so the form clears.
        }),
      });
      const data = await res.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        try {
          window.localStorage.setItem(SESSION_KEY, data.sessionId);
        } catch {}
        const captured = { firstName: leadFirst, email: leadEmail };
        setLead(captured);
        try {
          window.localStorage.setItem(LEAD_KEY, JSON.stringify(captured));
        } catch {}
      } else if (data.error) {
        setLeadErr(data.error);
      }
    } catch {
      setLeadErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t || busy || !sessionId) return;
    setBusy(true);
    setText("");
    const localMsg: Msg = { role: "user", text: t };
    setMessages((m) => [...m, localMsg]);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: t,
          sessionId,
          leadFirstName: lead?.firstName,
          leadEmail: lead?.email,
        }),
      });
      const data = await res.json();
      if (data.mode) setMode(data.mode);
      if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", authoredBy: "ai", text: data.reply }]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", authoredBy: "ai", text: "Network error. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const needsLead = !sessionId || !lead;

  return (
    <>
      <button
        aria-label="Open chat"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 50,
          padding: "12px 18px", borderRadius: 999, background: "#1f8a3c",
          color: "#fff", border: "none", cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}
      >
        {open ? "Close" : "Chat with us"}
      </button>
      {open && (
        <div
          style={{
            position: "fixed", bottom: 80, right: 20, width: 360, height: 480,
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
            display: "flex", flexDirection: "column", overflow: "hidden",
            zIndex: 50, boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ padding: "12px 16px", background: "#1f8a3c", color: "#fff", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>PennyLime Support</span>
            {mode === "human" && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "#fff", color: "#1f8a3c", padding: "2px 6px", borderRadius: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Live agent
              </span>
            )}
          </div>

          {needsLead ? (
            <form onSubmit={submitLead} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "#fafafa", flex: 1 }}>
              <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
                We&apos;ll save the chat to your inbox if we get disconnected. Where should we reach you?
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
                Your name
                <input
                  value={leadFirst}
                  onChange={(e) => setLeadFirst(e.target.value)}
                  placeholder="First name"
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", outline: "none", fontSize: 14, color: "#111" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
                Email
                <input
                  type="email"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", outline: "none", fontSize: 14, color: "#111" }}
                />
              </label>
              {leadErr && <div style={{ fontSize: 12, color: "#dc2626" }}>{leadErr}</div>}
              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: 4, padding: "10px 14px", borderRadius: 10,
                  background: "#1f8a3c", color: "#fff", border: "none",
                  cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {busy ? "Starting…" : "Start chat"}
              </button>
            </form>
          ) : (
            <>
              <div ref={listRef} style={{ flex: 1, padding: 12, overflowY: "auto", background: "#fafafa" }}>
                {messages.length === 0 && (
                  <div style={{ color: "#6b7280", fontSize: 14 }}>
                    Hi {lead.firstName}. Ask me about your application, payments, or how PennyLime works.
                  </div>
                )}
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  const isAdmin = m.authoredBy === "admin";
                  return (
                    <div key={m.id ?? i} style={{ margin: "8px 0", textAlign: isUser ? "right" : "left" }}>
                      {isAdmin && (
                        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>
                          PennyLime team
                        </div>
                      )}
                      <div
                        style={{
                          display: "inline-block", padding: "8px 12px", borderRadius: 12,
                          background: isUser ? "#1f8a3c" : isAdmin ? "#dcfce7" : "#fff",
                          color: isUser ? "#fff" : "#111",
                          border: isUser ? "none" : "1px solid #e5e7eb",
                          maxWidth: "85%", textAlign: "left", whiteSpace: "pre-wrap",
                        }}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                {busy && <div style={{ color: "#6b7280", fontSize: 13, marginTop: 8 }}>Thinking</div>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", padding: 8, gap: 8, borderTop: "1px solid #e5e7eb" }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={mode === "human" ? "Type a message to the team" : "Ask a question"}
                  disabled={busy}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", outline: "none", color: "#111" }}
                />
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  style={{ padding: "10px 14px", borderRadius: 10, background: "#1f8a3c", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

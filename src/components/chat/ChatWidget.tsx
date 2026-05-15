"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };
const STORAGE_KEY = "pennylime.agent.session";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSessionId(stored);
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t, sessionId }),
      });
      const data = await res.json();
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        try { window.localStorage.setItem(STORAGE_KEY, data.sessionId); } catch {}
      }
      setMessages((m) => [...m, { role: "assistant", text: data.reply ?? "Sorry, something went wrong." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label="Open chat"
        onClick={() => setOpen((o) => !o)}
        style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50, padding: "12px 18px", borderRadius: 999, background: "#1f8a3c", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
      >
        {open ? "Close" : "Chat with us"}
      </button>
      {open && (
        <div style={{ position: "fixed", bottom: 80, right: 20, width: 360, height: 480, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 50, boxShadow: "0 20px 50px rgba(0,0,0,0.18)" }}>
          <div style={{ padding: "12px 16px", background: "#1f8a3c", color: "#fff", fontWeight: 600 }}>PennyLime Support</div>
          <div ref={listRef} style={{ flex: 1, padding: 12, overflowY: "auto", background: "#fafafa" }}>
            {messages.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 14 }}>
                Hi. Ask me about your application, payments, or how PennyLime works.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ margin: "8px 0", textAlign: m.role === "user" ? "right" : "left" }}>
                <div style={{ display: "inline-block", padding: "8px 12px", borderRadius: 12, background: m.role === "user" ? "#1f8a3c" : "#fff", color: m.role === "user" ? "#fff" : "#111", border: m.role === "user" ? "none" : "1px solid #e5e7eb", maxWidth: "85%", textAlign: "left", whiteSpace: "pre-wrap" }}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div style={{ color: "#6b7280", fontSize: 13, marginTop: 8 }}>Thinking</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", padding: 8, gap: 8, borderTop: "1px solid #e5e7eb" }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question"
              disabled={busy}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", outline: "none" }}
            />
            <button type="submit" disabled={busy || !text.trim()} style={{ padding: "10px 14px", borderRadius: 10, background: "#1f8a3c", color: "#fff", border: "none", cursor: "pointer" }}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}

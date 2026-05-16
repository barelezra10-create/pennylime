"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendChatAdminReply, takeOverChatSession, releaseChatSession } from "@/actions/agent-chat";

export function SessionReplyPanel({
  sessionId,
  initialMode,
  isOnline,
}: {
  sessionId: string;
  initialMode: string;
  isOnline: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleTakeover() {
    setBusy(true);
    try {
      const r = await takeOverChatSession(sessionId);
      if (r.ok) {
        setMode("human");
        toast.success("Chat taken over — AI is paused");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    setBusy(true);
    try {
      const r = await releaseChatSession(sessionId);
      if (r.ok) {
        setMode("ai");
        toast.success("AI is responding again");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await sendChatAdminReply({ sessionId, text });
      if (r.ok) {
        setMode("human");
        setText("");
        toast.success(r.emailed ? "Sent + emailed (user offline)" : "Sent to chat");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">
          Reply as team
        </h2>
        {mode === "ai" ? (
          <button
            onClick={handleTakeover}
            disabled={busy}
            className="text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] disabled:opacity-50"
          >
            Take over from AI
          </button>
        ) : (
          <button
            onClick={handleRelease}
            disabled={busy}
            className="text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-[#e0e7ff] text-[#3730a3] hover:bg-[#c7d2fe] disabled:opacity-50"
          >
            Hand back to AI
          </button>
        )}
      </div>
      <p className="text-[11px] text-[#71717a] mb-3">
        Your reply appears in the user&apos;s chat widget instantly.{" "}
        {isOnline ? (
          <span className="text-[#15803d] font-semibold">User is online now.</span>
        ) : (
          <span className="text-[#71717a]">
            User is offline — message will also be emailed so they don&apos;t miss it.
          </span>
        )}
      </p>
      <form onSubmit={handleSend} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your reply…"
          rows={4}
          maxLength={4000}
          className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 resize-y"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#a1a1aa]">{text.length} / 4000</span>
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="text-[13px] font-semibold rounded-lg px-4 py-2 bg-[#15803d] text-white hover:bg-[#166534] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
    </div>
  );
}

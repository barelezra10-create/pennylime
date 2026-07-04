"use client";

import { useEffect, useState } from "react";
import { useDialer } from "./dialer-provider";

const OUTCOMES = [
  { value: "answered", label: "Answered" },
  { value: "no-answer", label: "No answer" },
  { value: "voicemail-left", label: "Left voicemail" },
  { value: "busy", label: "Busy" },
  { value: "wrong-number", label: "Wrong number" },
  { value: "other", label: "Other" },
];

function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.round((Date.now() - since) / 1000);
  return (
    <span className="tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function DialerPanel() {
  const { state, muted, hangUp, toggleMute, dismiss, saveWrapUp } = useDialer();
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.phase === "wrap-up") {
      setOutcome("answered");
      setNotes("");
    }
  }, [state.phase]);

  if (state.phase === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-[#e4e4e7] bg-white shadow-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[14px] font-semibold text-[#18181b]">{state.name}</p>
          <p className="text-[12px] text-[#71717a]">{state.phone}</p>
        </div>
        {(state.phase === "wrap-up" || state.phase === "error") && (
          <button onClick={dismiss} className="text-[#a1a1aa] hover:text-[#18181b] text-[16px] leading-none">
            x
          </button>
        )}
      </div>

      <div className="mt-3">
        {state.phase === "connecting" && <p className="text-[13px] text-[#71717a]">Connecting...</p>}
        {state.phase === "ringing" && <p className="text-[13px] text-[#2563eb]">Ringing...</p>}
        {state.phase === "in-call" && (
          <p className="text-[13px] text-[#15803d]">
            In call <Timer since={state.startedAt} />
          </p>
        )}
        {state.phase === "error" && <p className="text-[13px] text-[#dc2626]">{state.message}</p>}

        {(state.phase === "connecting" || state.phase === "ringing" || state.phase === "in-call") && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={toggleMute}
              disabled={state.phase !== "in-call"}
              className="flex-1 rounded-lg border border-[#e4e4e7] py-2 text-[13px] font-medium disabled:opacity-40"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={hangUp}
              className="flex-1 rounded-lg bg-[#dc2626] text-white py-2 text-[13px] font-medium"
            >
              Hang up
            </button>
          </div>
        )}

        {state.phase === "wrap-up" && (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] text-[#71717a]">
              Call ended{state.durationSec ? ` after ${state.durationSec}s` : ""}. Log the outcome:
            </p>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full rounded-lg border border-[#e4e4e7] px-2 py-1.5 text-[13px]"
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-lg border border-[#e4e4e7] px-2 py-1.5 text-[13px]"
            />
            <button
              onClick={async () => {
                setSaving(true);
                await saveWrapUp(outcome, notes);
                setSaving(false);
              }}
              disabled={saving}
              className="w-full rounded-lg bg-[#18181b] text-white py-2 text-[13px] font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

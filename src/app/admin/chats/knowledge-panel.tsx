"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listKnowledge,
  answerKnowledgeEntry,
  updateKnowledgeAnswer,
  setKnowledgeStatus,
  type KnowledgeRow,
} from "@/actions/knowledge";

export function KnowledgePanel() {
  const [pending, setPending] = useState<KnowledgeRow[] | null>(null);
  const [answered, setAnswered] = useState<KnowledgeRow[] | null>(null);
  // Per-entry draft text keyed by entry id
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Per-entry busy flag
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // Per-entry inline feedback
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; message: string }>>({});

  const loadPending = useCallback(() => {
    listKnowledge("PENDING").then(setPending).catch(() => {});
  }, []);

  const loadAnswered = useCallback(() => {
    listKnowledge("ANSWERED").then(setAnswered).catch(() => {});
  }, []);

  useEffect(() => {
    loadPending();
    loadAnswered();
    const t = setInterval(loadPending, 30_000);
    return () => clearInterval(t);
  }, [loadPending, loadAnswered]);

  const setDraft = (id: string, val: string) => setDrafts((d) => ({ ...d, [id]: val }));

  const clearDraft = (id: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const setSavingEntry = (id: string, val: boolean) =>
    setSaving((s) => ({ ...s, [id]: val }));

  const setFeedbackEntry = (id: string, f: { ok: boolean; message: string } | null) =>
    setFeedback((prev) => {
      const next = { ...prev };
      if (f === null) delete next[id];
      else next[id] = f;
      return next;
    });

  const handleSaveAndSend = async (entry: KnowledgeRow) => {
    const answer = drafts[entry.id] ?? "";
    if (!answer.trim()) return;
    setSavingEntry(entry.id, true);
    setFeedbackEntry(entry.id, null);
    const res = await answerKnowledgeEntry(entry.id, answer);
    setSavingEntry(entry.id, false);
    if (!res.ok) {
      setFeedbackEntry(entry.id, { ok: false, message: res.error ?? "Failed" });
    } else {
      const { sent, emailed } = res;
      const msg = `Sent to ${sent} chat${sent !== 1 ? "s" : ""}${emailed ? `, ${emailed} also emailed` : ""}`;
      setFeedbackEntry(entry.id, { ok: true, message: msg });
      clearDraft(entry.id);
      loadPending();
      loadAnswered();
    }
  };

  const handleDismiss = async (id: string) => {
    setSavingEntry(id, true);
    await setKnowledgeStatus(id, "DISABLED");
    setSavingEntry(id, false);
    loadPending();
  };

  const handleUpdateAnswer = async (entry: KnowledgeRow) => {
    const answer = drafts[entry.id];
    if (!answer || !answer.trim()) return;
    setSavingEntry(entry.id, true);
    setFeedbackEntry(entry.id, null);
    const res = await updateKnowledgeAnswer(entry.id, answer);
    setSavingEntry(entry.id, false);
    if (!res.ok) {
      setFeedbackEntry(entry.id, { ok: false, message: res.error ?? "Failed" });
    } else {
      clearDraft(entry.id);
      loadAnswered();
    }
  };

  const handleDisable = async (id: string) => {
    setSavingEntry(id, true);
    await setKnowledgeStatus(id, "DISABLED");
    setSavingEntry(id, false);
    loadAnswered();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Pending questions */}
      <section>
        <h2 className="text-[13px] font-semibold text-[#18181b] mb-3">Waiting for your answer</h2>
        {pending === null && <p className="text-[13px] text-[#71717a]">Loading...</p>}
        {pending?.length === 0 && (
          <p className="text-[13px] text-[#71717a]">The AI has no open questions for you.</p>
        )}
        <div className="flex flex-col gap-3">
          {pending?.map((entry) => {
            const draftVal = drafts[entry.id] ?? "";
            const fb = feedback[entry.id];
            const busy = saving[entry.id] ?? false;
            return (
              <div key={entry.id} className="rounded-xl border border-[#e4e4e7] bg-white p-4">
                <div className="flex items-start gap-2 mb-2">
                  <p className="text-[14px] font-semibold text-[#18181b] flex-1">{entry.question}</p>
                  <span
                    className="shrink-0 rounded-full bg-[#fef2f2] text-[#dc2626] px-2 py-0.5 text-[11px] font-semibold"
                  >
                    {entry.pendingWaiterCount} {entry.pendingWaiterCount === 1 ? "client" : "clients"} waiting
                  </span>
                </div>
                <textarea
                  value={draftVal}
                  onChange={(e) => setDraft(entry.id, e.target.value)}
                  rows={Math.max(2, draftVal.split("\n").length)}
                  placeholder="Type your answer..."
                  className="w-full resize-none rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px] mb-2"
                />
                {fb && (
                  <p className={`text-[12px] mb-2 ${fb.ok ? "text-[#15803d]" : "text-[#dc2626]"}`}>
                    {fb.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveAndSend(entry)}
                    disabled={!draftVal.trim() || busy}
                    className="rounded-lg bg-[#15803d] text-white px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  >
                    {busy ? "Saving..." : "Save & send"}
                  </button>
                  <button
                    onClick={() => handleDismiss(entry.id)}
                    disabled={busy}
                    className="rounded-lg border border-[#e4e4e7] text-[#71717a] px-3 py-1.5 text-[12px] hover:bg-[#fafafa] disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Learned answers */}
      <section>
        <h2 className="text-[13px] font-semibold text-[#18181b] mb-3">Learned answers</h2>
        {answered === null && <p className="text-[13px] text-[#71717a]">Loading...</p>}
        {answered?.length === 0 && (
          <p className="text-[13px] text-[#71717a]">Nothing learned yet. Answer a pending question above.</p>
        )}
        <div className="flex flex-col gap-3">
          {answered?.map((entry) => {
            const currentAnswer = entry.answer ?? "";
            const draftVal = drafts[entry.id];
            const textareaVal = draftVal !== undefined ? draftVal : currentAnswer;
            const isDirty = draftVal !== undefined && draftVal !== currentAnswer;
            const fb = feedback[entry.id];
            const busy = saving[entry.id] ?? false;
            return (
              <div key={entry.id} className="rounded-xl border border-[#e4e4e7] bg-white p-4">
                <p className="text-[14px] font-semibold text-[#18181b] mb-2">{entry.question}</p>
                <textarea
                  value={textareaVal}
                  onChange={(e) => setDraft(entry.id, e.target.value)}
                  rows={Math.max(2, textareaVal.split("\n").length)}
                  className="w-full resize-none rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px] mb-1"
                />
                {fb && (
                  <p className={`text-[12px] mb-1 ${fb.ok ? "text-[#15803d]" : "text-[#dc2626]"}`}>
                    {fb.message}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {isDirty && (
                    <button
                      onClick={() => handleUpdateAnswer(entry)}
                      disabled={busy}
                      className="rounded-lg bg-[#18181b] text-white px-3 py-1 text-[12px] font-medium disabled:opacity-40"
                    >
                      {busy ? "Saving..." : "Save"}
                    </button>
                  )}
                  <span className="text-[12px] text-[#a1a1aa]">sent {entry.timesSent}x</span>
                  <button
                    onClick={() => handleDisable(entry.id)}
                    disabled={busy}
                    className="ml-auto rounded-lg border border-[#e4e4e7] text-[#71717a] px-3 py-1 text-[12px] hover:bg-[#fafafa] disabled:opacity-40"
                  >
                    Disable
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

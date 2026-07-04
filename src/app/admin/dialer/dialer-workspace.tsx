"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CallButton } from "@/components/admin/dialer/call-button";
import { ContactCalls } from "@/components/admin/dialer/contact-calls";
import { useDialer } from "@/components/admin/dialer/dialer-provider";
import { KANBAN_STAGES, STAGE_COLORS } from "@/lib/contact-helpers";
import { dialedDigits, formatDialed, dialedToE164 } from "@/lib/voice/dialpad";
import { addContactNote, getContactNotes } from "@/actions/contacts";
import { MoneyPanel } from "./money-panel";
import { buildCallQueue } from "./call-queue";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  stage: string;
};

type Note = { id: string; details: string; performedBy: string | null; createdAt: string };

type RunState = {
  queue: ContactRow[];
  index: number;
  status: "dialing" | "between" | "paused";
  countdown: number;
};

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function tenDigits(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export function DialerWorkspace({ contacts }: { contacts: ContactRow[] }) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("ALL");
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [tab, setTab] = useState<"dialpad" | "contact">("dialpad");
  const [digits, setDigits] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, startNoteSave] = useTransition();
  const { startCall, hangUp, state } = useDialer();
  const selectedIdRef = useRef<string | null>(null);

  // --- Run state ---
  const [run, setRun] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  runRef.current = run;
  const prevPhaseRef = useRef(state.phase);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return contacts.filter((c) => {
      if (stage !== "ALL" && c.stage !== stage) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (qDigits.length > 0 && (c.phone || "").replace(/\D/g, "").includes(qDigits))
      );
    });
  }, [contacts, search, stage]);

  const e164 = dialedToE164(digits);
  const matchedContact = useMemo(() => {
    if (!e164) return null;
    const ten = e164.slice(2);
    return contacts.find((c) => tenDigits(c.phone) === ten) || null;
  }, [contacts, e164]);

  // Memoized so dialContact (which depends on it) stays stable across renders.
  const selectContact = useCallback((c: ContactRow) => {
    selectedIdRef.current = c.id;
    setSelected(c);
    setTab("contact");
    setNotes(null);
    setNoteText("");
    setNoteError(null);
    getContactNotes(c.id)
      .then((n) => { if (selectedIdRef.current === c.id) setNotes(n); })
      .catch(() => { if (selectedIdRef.current === c.id) setNotes([]); });
  }, []);

  const saveNote = () => {
    if (!selected || !noteText.trim()) return;
    const forId = selected.id;
    setNoteError(null);
    startNoteSave(async () => {
      try {
        const note = await addContactNote(forId, noteText);
        if (selectedIdRef.current === forId) {
          setNotes((n) => [note, ...(n || [])]);
          setNoteText("");
        }
      } catch {
        if (selectedIdRef.current === forId) setNoteError("Could not save the note. Try again.");
      }
    });
  };

  const padPress = (k: string) => {
    if (k === "*" || k === "#") return; // shown for familiarity, not part of US numbers
    setDigits((d) => dialedDigits(d + k));
  };

  const busy = state.phase !== "idle" && state.phase !== "wrap-up" && state.phase !== "error";
  const dialName = matchedContact?.name || formatDialed(digits);

  const dial = () => {
    if (!e164 || busy) return;
    void startCall({ phone: e164, name: dialName, contactId: matchedContact?.id });
  };

  // Selects and dials a contact. Side effects are always called outside setRun updaters.
  const dialContact = useCallback((c: ContactRow) => {
    selectContact(c);
    if (c.phone) void startCall({ phone: c.phone, name: c.name || c.phone, contactId: c.id });
  }, [selectContact, startCall]);

  const filterActive = search.trim() !== "" || stage !== "ALL";
  const runnableQueue = useMemo(
    () => buildCallQueue(contacts, filterActive, filtered),
    [contacts, filterActive, filtered]
  );

  const startRun = () => {
    if (runnableQueue.length === 0) return;
    setRun({ queue: runnableQueue, index: 0, status: "dialing", countdown: 0 });
    dialContact(runnableQueue[0]);
  };

  const endRun = () => setRun(null);

  // Advances to the next contact in the queue. All dialContact calls happen outside
  // the setRun updater to avoid strict-mode double-invocation issues.
  const advanceRun = useCallback((immediate: boolean) => {
    const r = runRef.current;
    if (!r) return;
    const nextIndex = r.index + 1;
    if (nextIndex >= r.queue.length) {
      setRun(null); // run finished
      return;
    }
    if (immediate) {
      setRun({ ...r, index: nextIndex, status: "dialing", countdown: 0 });
      dialContact(r.queue[nextIndex]);
    } else {
      // Enter "between" with countdown 3; the countdown effect will dial r.queue[nextIndex].
      setRun({ ...r, index: nextIndex, status: "between", countdown: 3 });
    }
  }, [dialContact]);

  // Advance when a wrap-up is completed while a run is active.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    const r = runRef.current;
    if (!r) return;
    if (prev === "wrap-up" && state.phase === "idle" && r.status === "dialing") {
      advanceRun(false);
    }
    if (state.phase === "error" && r.status === "dialing") {
      setRun((cur) => (cur ? { ...cur, status: "paused", countdown: 0 } : cur));
    }
  }, [state.phase, advanceRun]);

  // Between-calls countdown: tick once per second, dial when it reaches 0.
  // dialContact is called OUTSIDE the setRun call to avoid strict-mode double-invocation.
  useEffect(() => {
    if (!run || run.status !== "between") return;
    const t = setTimeout(() => {
      const r = runRef.current;
      if (!r || r.status !== "between") return;
      if (r.countdown <= 1) {
        const contact = r.queue[r.index];
        setRun({ ...r, status: "dialing", countdown: 0 });
        dialContact(contact);
      } else {
        setRun({ ...r, countdown: r.countdown - 1 });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [run, dialContact]);

  const pauseRun = () =>
    setRun((r) => (r ? { ...r, status: "paused", countdown: 0 } : r));

  const resumeRun = () => {
    // Read current run before setRun so we can dialContact outside the updater.
    const r = runRef.current;
    setRun((cur) => (cur ? { ...cur, status: "dialing" } : cur));
    if (r && state.phase === "idle") dialContact(r.queue[r.index]);
  };

  const skipRun = () => {
    if (
      state.phase === "in-call" ||
      state.phase === "ringing" ||
      state.phase === "connecting"
    ) {
      hangUp(); // triggers disconnect -> wrap-up; saving wrap-up advances via phase effect
    } else {
      advanceRun(true);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: contact list */}
      <div className="lg:w-1/3 w-full">
        <button
          onClick={startRun}
          disabled={!!run || runnableQueue.length === 0}
          className="w-full mb-3 rounded-lg bg-[#15803d] text-white py-2 text-[13px] font-semibold disabled:opacity-40"
        >
          &#9742; Start call run{" "}
          {stage === "ALL" && !search.trim() ? "(Late, then Repaying)" : "(current filter)"}
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone..."
          className="w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px] mb-3 bg-white"
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["ALL", ...KANBAN_STAGES].map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                stage === s ? "bg-[#18181b] text-white border-[#18181b]" : "bg-white text-[#3f3f46] border-[#e4e4e7]"
              }`}
            >
              {s === "ALL" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-[#e4e4e7] bg-white divide-y divide-[#f4f4f5]">
          {filtered.length === 0 && <p className="p-4 text-[13px] text-[#71717a]">No contacts match.</p>}
          {filtered.map((c) => {
            const colors = STAGE_COLORS[c.stage] || { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" };
            return (
              <button
                key={c.id}
                onClick={() => selectContact(c)}
                className={`w-full text-left p-3 hover:bg-[#fafafa] ${selected?.id === c.id ? "bg-[#eff6ff]" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#18181b] truncate">{c.name || c.email || "Unnamed"}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                    {c.stage.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[12px] text-[#71717a] mt-0.5">{c.phone || "no phone"}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: dial pad / contact */}
      <div className="lg:w-2/3 w-full">
        {run && (
          <div className="flex items-center justify-between gap-2 mb-4 rounded-lg bg-[#18181b] text-white px-3 py-2">
            <span className="text-[13px] font-medium">
              Call run: {run.index + 1} of {run.queue.length}
              {run.status === "between" && ` - calling next in ${run.countdown}...`}
              {run.status === "paused" && " - paused"}
            </span>
            <div className="flex gap-1.5">
              {run.status === "paused" ? (
                <button onClick={resumeRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">
                  Resume
                </button>
              ) : (
                <button onClick={pauseRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">
                  Pause
                </button>
              )}
              <button onClick={skipRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">
                Skip
              </button>
              <button onClick={endRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">
                End run
              </button>
            </div>
          </div>
        )}

        {!run && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab("dialpad")}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium border ${
                tab === "dialpad" ? "bg-[#18181b] text-white border-[#18181b]" : "bg-white text-[#3f3f46] border-[#e4e4e7]"
              }`}
            >
              Dial pad
            </button>
            <button
              onClick={() => setTab("contact")}
              disabled={!selected}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium border disabled:opacity-40 ${
                tab === "contact" ? "bg-[#18181b] text-white border-[#18181b]" : "bg-white text-[#3f3f46] border-[#e4e4e7]"
              }`}
            >
              {selected ? selected.name || "Contact" : "Contact"}
            </button>
          </div>
        )}

        {tab === "dialpad" && (
          <div className="rounded-xl border border-[#e4e4e7] bg-white p-6 max-w-sm">
            <input
              value={formatDialed(digits)}
              onChange={(e) => setDigits(dialedDigits(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") dial();
              }}
              placeholder="(555) 123-4567"
              inputMode="tel"
              aria-label="Phone number to dial"
              className="w-full text-center text-[22px] tracking-wide rounded-lg border border-[#e4e4e7] px-3 py-2 mb-2"
            />
            {matchedContact && (
              <button onClick={() => selectContact(matchedContact)} className="w-full text-[12px] text-[#2563eb] hover:underline mb-2">
                This is {matchedContact.name} - open contact
              </button>
            )}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PAD_KEYS.map((k) => {
                const inert = k === "*" || k === "#";
                return (
                  <button
                    key={k}
                    onClick={() => padPress(k)}
                    disabled={inert}
                    title={inert ? "Not used for US numbers" : undefined}
                    className="rounded-lg border border-[#e4e4e7] py-3 text-[16px] font-medium hover:bg-[#fafafa] disabled:opacity-40"
                  >
                    {k}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDigits((d) => d.slice(0, -1))}
                disabled={!digits}
                className="rounded-lg border border-[#e4e4e7] px-4 py-2 text-[13px] disabled:opacity-40"
                aria-label="Delete last digit"
              >
                &#9003;
              </button>
              <button
                onClick={dial}
                disabled={!e164 || busy}
                className="flex-1 rounded-lg bg-[#15803d] text-white py-2 text-[14px] font-semibold disabled:opacity-40"
              >
                &#9742; Call
              </button>
            </div>
          </div>
        )}

        {tab === "contact" && selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#e4e4e7] bg-white p-5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold text-[#18181b]">{selected.name || "Unnamed"}</h2>
                  {(() => {
                    const colors = STAGE_COLORS[selected.stage] || { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" };
                    return (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                        {selected.stage.replace(/_/g, " ")}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-[13px] text-[#71717a] mt-1">{selected.phone || "no phone"}</p>
                <Link href={`/admin/contacts/${selected.id}`} className="text-[12px] text-[#2563eb] hover:underline">
                  Open contact page
                </Link>
              </div>
              <CallButton phone={selected.phone} name={selected.name} contactId={selected.id} />
            </div>

            <MoneyPanel contactId={selected.id} />

            <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
              <h3 className="text-[13px] font-bold text-black mb-3">Notes</h3>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type a note about this contact..."
                rows={2}
                className="w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px]"
              />
              {noteError && <p className="text-[12px] text-[#dc2626] mt-1">{noteError}</p>}
              <button
                onClick={saveNote}
                disabled={savingNote || !noteText.trim()}
                className="mt-2 rounded-lg bg-[#18181b] text-white px-4 py-1.5 text-[13px] font-medium disabled:opacity-40"
              >
                {savingNote ? "Saving..." : "Save note"}
              </button>
              <div className="mt-4 space-y-2">
                {notes === null && <p className="text-[12px] text-[#71717a]">Loading notes...</p>}
                {notes?.length === 0 && <p className="text-[12px] text-[#71717a]">No notes yet.</p>}
                {notes?.map((n) => (
                  <div key={n.id} className="rounded-lg bg-[#fafafa] border border-[#f4f4f5] p-2.5">
                    <p className="text-[12px] text-[#3f3f46] whitespace-pre-wrap">{n.details}</p>
                    <p className="text-[11px] text-[#a1a1aa] mt-1">
                      {n.performedBy || "admin"} - {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
              <h3 className="text-[13px] font-bold text-black mb-3">Call history</h3>
              <ContactCalls contactId={selected.id} />
            </div>
          </div>
        )}

        {tab === "contact" && !selected && (
          <p className="text-[13px] text-[#71717a]">Pick a contact from the list.</p>
        )}
      </div>
    </div>
  );
}

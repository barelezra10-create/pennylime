# Dialer Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A split-screen calling workspace at /admin/dialer: pick a contact (search + stage filters) or dial any number on a keypad, call via the existing softphone, and save contact timeline notes.

**Architecture:** One new server page with a lean contact query feeding one client component (list + tabs). Calling reuses DialerProvider/CallButton; call history reuses ContactCalls; notes are Activity rows (type "note") via new server actions. Nav landing changes to /admin/dialer; middleware gains the path.

**Tech Stack:** Next.js 16 App Router, Prisma 7, next-auth, vitest, existing dialer components.

**Spec:** `docs/superpowers/specs/2026-07-04-dialer-workspace-design.md`

**Conventions:** commits on main with inline identity (`git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit ...`), Co-Authored-By Claude line, no em dashes anywhere, never commit `.pl_recipients.json` or `scripts/pause-notice-send.js`. Verify with `npx tsc --noEmit` (zero errors expected) and `npm test`.

---

### Task 1: Dial pad number helpers (TDD)

**Files:**
- Create: `src/lib/voice/dialpad.ts`
- Test: `src/lib/voice/dialpad.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice/dialpad.test.ts
import { describe, it, expect } from "vitest";
import { dialedDigits, formatDialed, dialedToE164 } from "./dialpad";

describe("dialedDigits", () => {
  it("strips non-digits and caps at 11", () => {
    expect(dialedDigits("(555) 123-4567")).toBe("5551234567");
    expect(dialedDigits("+1 555 123 4567 999")).toBe("15551234567");
    expect(dialedDigits("abc")).toBe("");
  });
});

describe("formatDialed", () => {
  it("formats progressively as (XXX) XXX-XXXX", () => {
    expect(formatDialed("")).toBe("");
    expect(formatDialed("555")).toBe("(555");
    expect(formatDialed("5551")).toBe("(555) 1");
    expect(formatDialed("5551234567")).toBe("(555) 123-4567");
  });

  it("shows a leading 1 as +1 prefix", () => {
    expect(formatDialed("15551234567")).toBe("+1 (555) 123-4567");
  });
});

describe("dialedToE164", () => {
  it("returns E.164 for complete US numbers", () => {
    expect(dialedToE164("5551234567")).toBe("+15551234567");
    expect(dialedToE164("15551234567")).toBe("+15551234567");
  });

  it("returns null for incomplete numbers", () => {
    expect(dialedToE164("555123")).toBeNull();
    expect(dialedToE164("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run `npx vitest run src/lib/voice/dialpad.test.ts`** - expect FAIL (cannot resolve ./dialpad).

- [ ] **Step 3: Implement**

```typescript
// src/lib/voice/dialpad.ts
// Pure helpers for the manual dial pad. US-only formatting, matching the
// normalizePhone convention used across the app (+1 prefix).

/** Keep only digits, cap at 11 (a leading 1 plus 10 digits). */
export function dialedDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 11);
}

/** Progressive display format: (XXX) XXX-XXXX, with +1 prefix when present. */
export function formatDialed(digits: string): string {
  const hasCountry = digits.startsWith("1") && digits.length > 10 - 1 + 2; // "1" + at least 1 digit
  const d = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits.startsWith("1") && digits.length > 1 && digits.length <= 11 && digits.length > 10 ? digits.slice(1) : digits;
  const ten = digits.startsWith("1") && digits.length > 10 ? digits.slice(1) : digits;
  const prefix = digits.startsWith("1") && digits.length > 10 ? "+1 " : "";
  if (!ten) return "";
  if (ten.length <= 3) return `${prefix}(${ten}`;
  if (ten.length <= 6) return `${prefix}(${ten.slice(0, 3)}) ${ten.slice(3)}`;
  return `${prefix}(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6, 10)}`;
}

/** E.164 (+1XXXXXXXXXX) once 10 digits are present, else null. */
export function dialedToE164(digits: string): string | null {
  const ten = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  if (ten.length !== 10 || ten.startsWith("1")) return ten.length === 10 ? `+1${ten}` : null;
  return `+1${ten}`;
}
```

NOTE: the `formatDialed` draft above is deliberately shown as first-pass; clean it while making the tests pass. The final function must be simple: derive `ten` (strip leading 1 only when length is 11), derive `prefix` ("+1 " only when length is 11), then the three format branches. `dialedToE164` must be: strip leading 1 when length is 11; return `+1${ten}` when `ten.length === 10`, else null. Remove any dead branches; all tests green defines done.

- [ ] **Step 4: Run `npx vitest run src/lib/voice/dialpad.test.ts`** - expect PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/dialpad.ts src/lib/voice/dialpad.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: dial pad number formatting helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Contact note server actions

**Files:**
- Modify: `src/actions/contacts.ts` (append at end)

- [ ] **Step 1: Append the two actions**

```typescript
// --- Dialer workspace notes -------------------------------------------------

export async function getContactNotes(contactId: string, limit = 10) {
  const notes = await prisma.activity.findMany({
    where: { contactId, type: "note" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return notes.map((n) => ({
    id: n.id,
    details: n.details || "",
    performedBy: n.performedBy,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function addContactNote(contactId: string, details: string) {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const text = details.trim();
  if (!text) throw new Error("Note is empty");

  const note = await prisma.activity.create({
    data: {
      contactId,
      type: "note",
      title: "Note",
      details: text.slice(0, 5000),
      performedBy: session.user.email,
    },
  });
  return {
    id: note.id,
    details: note.details || "",
    performedBy: note.performedBy,
    createdAt: note.createdAt.toISOString(),
  };
}
```

Check first how other mutating actions in this file handle auth; if the file already imports getServerSession/authOptions at top level without breaking the public apply flow, use top-level imports instead of dynamic ones. The Activity model (prisma/schema.prisma line ~619) has exactly: contactId, type, title, details, performedBy.

- [ ] **Step 2: `npx tsc --noEmit`** - zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/contacts.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "contacts: timeline note actions for the dialer workspace

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Workspace page and client component

**Files:**
- Create: `src/app/admin/dialer/page.tsx`
- Create: `src/app/admin/dialer/dialer-workspace.tsx`

- [ ] **Step 1: Server page**

```tsx
// src/app/admin/dialer/page.tsx
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DialerWorkspace } from "./dialer-workspace";

export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      stage: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  const rows = contacts
    .map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName || ""}`.trim(),
      email: c.email,
      phone: c.phone,
      stage: c.stage,
      updatedAt: c.updatedAt.toISOString(),
    }))
    .sort((a, b) => (a.phone ? 0 : 1) - (b.phone ? 0 : 1));

  return (
    <div>
      <PageHeader title="Dialer" description="Pick a contact or dial any number" />
      <DialerWorkspace contacts={rows} />
    </div>
  );
}
```

Verify PageHeader's props against src/components/admin/page-header.tsx and adjust if its API differs.

- [ ] **Step 2: Client component**

```tsx
// src/app/admin/dialer/dialer-workspace.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CallButton } from "@/components/admin/dialer/call-button";
import { ContactCalls } from "@/components/admin/dialer/contact-calls";
import { useDialer } from "@/components/admin/dialer/dialer-provider";
import { KANBAN_STAGES, STAGE_COLORS } from "@/lib/contact-helpers";
import { dialedDigits, formatDialed, dialedToE164 } from "@/lib/voice/dialpad";
import { addContactNote, getContactNotes } from "@/actions/contacts";

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  updatedAt: string;
};

type Note = { id: string; details: string; performedBy: string | null; createdAt: string };

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
  const { startCall, state } = useDialer();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (stage !== "ALL" && c.stage !== stage) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || " ")
      );
    });
  }, [contacts, search, stage]);

  const e164 = dialedToE164(digits);
  const matchedContact = useMemo(() => {
    if (!e164) return null;
    const ten = e164.slice(2);
    return contacts.find((c) => tenDigits(c.phone) === ten) || null;
  }, [contacts, e164]);

  const selectContact = (c: ContactRow) => {
    setSelected(c);
    setTab("contact");
    setNotes(null);
    setNoteText("");
    setNoteError(null);
    getContactNotes(c.id).then(setNotes).catch(() => setNotes([]));
  };

  const saveNote = () => {
    if (!selected || !noteText.trim()) return;
    setNoteError(null);
    startNoteSave(async () => {
      try {
        const note = await addContactNote(selected.id, noteText);
        setNotes((n) => [note, ...(n || [])]);
        setNoteText("");
      } catch {
        setNoteError("Could not save the note. Try again.");
      }
    });
  };

  const padPress = (k: string) => {
    if (k === "*" || k === "#") return; // shown for familiarity, not part of US numbers
    setDigits((d) => dialedDigits(d + k));
  };

  const busy = state.phase !== "idle" && state.phase !== "wrap-up" && state.phase !== "error";

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: contact list */}
      <div className="lg:w-1/3 w-full">
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

        {tab === "dialpad" && (
          <div className="rounded-xl border border-[#e4e4e7] bg-white p-6 max-w-sm">
            <input
              value={formatDialed(digits)}
              onChange={(e) => setDigits(dialedDigits(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e164 && !busy) {
                  void startCall({ phone: e164, name: matchedContact?.name || formatDialed(digits) , contactId: matchedContact?.id });
                }
              }}
              placeholder="(555) 123-4567"
              inputMode="tel"
              className="w-full text-center text-[22px] tracking-wide rounded-lg border border-[#e4e4e7] px-3 py-2 mb-2"
            />
            {matchedContact && (
              <button onClick={() => selectContact(matchedContact)} className="w-full text-[12px] text-[#2563eb] hover:underline mb-2">
                This is {matchedContact.name} - open contact
              </button>
            )}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PAD_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => padPress(k)}
                  className="rounded-lg border border-[#e4e4e7] py-3 text-[16px] font-medium hover:bg-[#fafafa]"
                >
                  {k}
                </button>
              ))}
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
                onClick={() => e164 && startCall({ phone: e164, name: matchedContact?.name || formatDialed(digits), contactId: matchedContact?.id })}
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
```

- [ ] **Step 3: `npx tsc --noEmit`** zero errors; `npm test` all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dialer
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: workspace page with contact picker, dial pad, and notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Nav landing + middleware

**Files:**
- Modify: `src/components/admin/top-nav.tsx` (dialer tab, line ~109)
- Modify: `src/middleware.ts` (ADMIN_PROTECTED, line ~7)

- [ ] **Step 1: Update the dialer tab**

Replace the existing dialer tab object with:

```typescript
  {
    id: "dialer",
    label: "Dialer",
    icon: "✆",
    prefixes: ["/admin/dialer", "/admin/calls"],
    href: "/admin/dialer",
    subnav: [
      { href: "/admin/dialer", label: "Workspace" },
      { href: "/admin/calls", label: "Calls & voicemails" },
      { href: "/admin/settings/tracking", label: "Voice settings" },
    ],
  },
```

- [ ] **Step 2: Middleware**

In `src/middleware.ts` add `"/admin/dialer",` to ADMIN_PROTECTED (next to "/admin/calls").

- [ ] **Step 3: `npx tsc --noEmit`** zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/top-nav.tsx src/middleware.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: dialer tab lands on the workspace, gate /admin/dialer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification and deploy

- [ ] **Step 1:** `npm test` all pass; `npx tsc --noEmit` zero errors; `npm run build` succeeds.

- [ ] **Step 2:** Deploy: `git push origin main`, then verify on Railway: `railway deployment list | head -3` shows SUCCESS (allow several minutes; brief 502 while migrations/seeds run at boot).

- [ ] **Step 3:** Manual acceptance: /admin/dialer loads behind login; search and stage filters work; selecting a contact shows header/notes/history; saving a note appears immediately and on the contact page timeline; dial pad formats input, matches a known contact ("This is..."), Call disabled until 10 digits.

---

## Self-review notes

- Spec coverage: helpers (Task 1), note actions (Task 2), page + client incl. dial pad, match banner, notes, history (Task 3), nav + middleware (Task 4), verify + deploy (Task 5).
- Type consistency: ContactRow/Note shapes match the serializers in Task 2 and Task 3 Step 1; startCall's {phone, name, contactId} matches DialerProvider's signature.
- Task 1's draft formatDialed is flagged for cleanup during TDD; done = tests green with no dead branches.

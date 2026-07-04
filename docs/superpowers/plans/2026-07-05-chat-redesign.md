# Chat Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A messenger-style admin page at /admin/chats for reading and answering visitor chats, plus a rebuilt responsive visitor ChatWidget, on the existing AgentSession/AgentMessage backend.

**Architecture:** New server actions in src/actions/agent-chat.ts (list/get/archive), one additive `passive` flag on the chat API's poll branch, a two-pane polling admin UI, and a Tailwind rewrite of ChatWidget with pure, tested helpers for conversation sorting and message merging. AI pipeline and email inbox untouched.

**Tech Stack:** Next.js 16 App Router, Prisma 7, next-auth, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-chat-redesign-design.md`

**Conventions:** commits on main with inline identity (`git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit ...`) + Co-Authored-By Claude line; no em dashes anywhere; never commit `.pl_recipients.json` / `scripts/pause-notice-send.js`; verify with `npx tsc --noEmit` (zero errors) and `npm test`.

**Backend facts (verified):**
- `AgentSession`: channel, mode ("ai"|"human"), handlingStatus, archivedAt, startedAt, endedAt, lastPolledAt (online = within 30s), lead fields (leadFirstName, leadEmail, check model for exact set), contactId, contact relation.
- `AgentMessage`: id, sessionId, role ("user"|"assistant"|"system"|"tool"), senderEmail (set = human admin reply), emailedAt, text, createdAt.
- `AgentToolCall`: id, sessionId, name, resultStatus, resultSummary, durationMs, createdAt.
- `sendChatAdminReply({sessionId, text})` returns `{ok: boolean, error?}` and flips mode to human + emails offline visitors (src/actions/agent-chat.ts:66).
- `takeOverChatSession(sessionId)` / `releaseChatSession(sessionId)` exist in the same file.
- POST /api/agent/chat with `{sessionId, sinceMessageId}` = poll; handlePoll (route.ts:201) bumps lastPolledAt then returns `{mode, messages: [{id, role, text, authoredBy: "admin"|"ai"|"user", createdAt}]}`.
- pendingChats badge: src/actions/inbox-badges.ts:114 (currently ignores archivedAt).

---

### Task 1: Pure helpers (TDD): conversation sort + widget message merge

**Files:**
- Create: `src/app/admin/chats/sort-conversations.ts`
- Create: `src/components/chat/merge-messages.ts`
- Test: `src/app/admin/chats/sort-conversations.test.ts`
- Test: `src/components/chat/merge-messages.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/admin/chats/sort-conversations.test.ts
import { describe, it, expect } from "vitest";
import { sortConversations, type SortableConversation } from "./sort-conversations";

const c = (id: string, needsReply: boolean, waitingSinceMs: number | null, lastMessageAtMs: number): SortableConversation => ({
  id,
  needsReply,
  waitingSinceMs,
  lastMessageAtMs,
});

describe("sortConversations", () => {
  it("puts needs-reply first, oldest-waiting first within that group", () => {
    const rows = [
      c("recent", false, null, 5000),
      c("waiting-new", true, 4000, 4000),
      c("waiting-old", true, 1000, 1000),
      c("older", false, null, 2000),
    ];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(["waiting-old", "waiting-new", "recent", "older"]);
  });

  it("sorts non-needs-reply by last message desc", () => {
    const rows = [c("a", false, null, 1), c("b", false, null, 3), c("x", false, null, 2)];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(["b", "x", "a"]);
  });
});
```

```typescript
// src/components/chat/merge-messages.test.ts
import { describe, it, expect } from "vitest";
import { mergeMessages, type ChatMsg } from "./merge-messages";

const m = (id: string, text: string, authoredBy: ChatMsg["authoredBy"] = "user", pending = false): ChatMsg => ({
  id,
  text,
  authoredBy,
  createdAt: "2026-07-05T10:00:00.000Z",
  pending,
});

describe("mergeMessages", () => {
  it("appends new server messages and dedupes by id", () => {
    const existing = [m("1", "hi"), m("2", "hello", "ai")];
    const incoming = [m("2", "hello", "ai"), m("3", "how can I help", "ai")];
    expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("replaces a pending optimistic user message when the server echo arrives", () => {
    const existing = [m("srv-1", "hi"), m("tmp-abc", "my balance?", "user", true)];
    const incoming = [m("srv-2", "my balance?", "user")];
    const out = mergeMessages(existing, incoming);
    expect(out.map((x) => x.id)).toEqual(["srv-1", "srv-2"]);
    expect(out.some((x) => x.pending)).toBe(false);
  });

  it("keeps a pending message that has no server echo yet", () => {
    const existing = [m("tmp-1", "typing away", "user", true)];
    const incoming = [m("srv-9", "welcome!", "ai")];
    expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["srv-9", "tmp-1"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/admin/chats/sort-conversations.test.ts src/components/chat/merge-messages.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```typescript
// src/app/admin/chats/sort-conversations.ts
// Pure ordering for the admin chat inbox list.

export type SortableConversation = {
  id: string;
  needsReply: boolean;
  waitingSinceMs: number | null;
  lastMessageAtMs: number;
};

/** Needs-reply first (longest-waiting on top), then everything else by recency. */
export function sortConversations<T extends SortableConversation>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    if (a.needsReply && b.needsReply) {
      return (a.waitingSinceMs ?? 0) - (b.waitingSinceMs ?? 0);
    }
    return b.lastMessageAtMs - a.lastMessageAtMs;
  });
}
```

```typescript
// src/components/chat/merge-messages.ts
// Pure merge of polled server messages into local widget state.

export type ChatMsg = {
  id: string;
  text: string;
  authoredBy: "user" | "ai" | "admin";
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

/**
 * Appends incoming server messages, deduping by id. A pending optimistic
 * user message is replaced by its server echo (matched by authoredBy
 * "user" + identical text); pending messages without an echo stay at the
 * end so the user never loses what they typed.
 */
export function mergeMessages(existing: ChatMsg[], incoming: ChatMsg[]): ChatMsg[] {
  const known = new Set(existing.filter((m) => !m.pending).map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));

  let settled = existing.filter((m) => !m.pending);
  let pendings = existing.filter((m) => m.pending);

  for (const msg of fresh) {
    if (msg.authoredBy === "user") {
      const echoIdx = pendings.findIndex((p) => p.text === msg.text);
      if (echoIdx !== -1) pendings = pendings.filter((_, i) => i !== echoIdx);
    }
    settled = [...settled, msg];
  }
  return [...settled, ...pendings];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/admin/chats/sort-conversations.test.ts src/components/chat/merge-messages.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/chats/sort-conversations.ts src/app/admin/chats/sort-conversations.test.ts src/components/chat/merge-messages.ts src/components/chat/merge-messages.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: conversation sorting and message merge helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Server actions (list/get/archive) + badge fix

**Files:**
- Modify: `src/actions/agent-chat.ts` (append; file has "use server", prisma, getServerSession, authOptions)
- Modify: `src/actions/inbox-badges.ts` (pendingChats archivedAt fix)

- [ ] **Step 1: Append the actions**

First READ the AgentSession model in prisma/schema.prisma (lines ~1282-1323) for the exact lead field names (leadFirstName, leadLastName if present, leadEmail) and adjust the name computation accordingly.

```typescript
// --- Admin chats inbox -------------------------------------------------------

const ONLINE_THRESHOLD_MS = 30_000;

export type ChatConversationRow = {
  id: string;
  name: string;
  contactId: string | null;
  mode: string;
  handlingStatus: string;
  archived: boolean;
  startedAt: string;
  online: boolean;
  needsReply: boolean;
  waitingSinceMs: number | null;
  lastMessage: { text: string; at: string; authoredBy: "user" | "ai" | "admin" } | null;
};

export async function listChatConversations(
  filter: "needs-reply" | "open" | "all" | "archived"
): Promise<ChatConversationRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const where: Record<string, unknown> = { channel: "chat" };
  if (filter === "archived") where.archivedAt = { not: null };
  else where.archivedAt = null;
  if (filter === "open") where.handlingStatus = { not: "RESOLVED" };

  const sessions = await prisma.agentSession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      contactId: true,
      mode: true,
      handlingStatus: true,
      archivedAt: true,
      startedAt: true,
      lastPolledAt: true,
      leadFirstName: true,
      leadEmail: true,
      contact: { select: { firstName: true, lastName: true } },
      messages: {
        where: { role: { in: ["user", "assistant"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { role: true, senderEmail: true, text: true, createdAt: true },
      },
    },
  });

  const now = Date.now();
  const rows: ChatConversationRow[] = sessions.map((s) => {
    const last = s.messages[0] ?? null;
    const needsReply = !!last && last.role === "user";
    const name =
      (s.contact ? `${s.contact.firstName} ${s.contact.lastName || ""}`.trim() : "") ||
      s.leadFirstName ||
      s.leadEmail ||
      "Anonymous";
    return {
      id: s.id,
      name,
      contactId: s.contactId,
      mode: s.mode,
      handlingStatus: s.handlingStatus,
      archived: !!s.archivedAt,
      startedAt: s.startedAt.toISOString(),
      online: !!s.lastPolledAt && now - s.lastPolledAt.getTime() < ONLINE_THRESHOLD_MS,
      needsReply,
      waitingSinceMs: needsReply && last ? last.createdAt.getTime() : null,
      lastMessage: last
        ? {
            text: last.text.slice(0, 120),
            at: last.createdAt.toISOString(),
            authoredBy: last.senderEmail ? "admin" : last.role === "assistant" ? "ai" : "user",
          }
        : null,
    };
  });

  if (filter === "needs-reply") return rows.filter((r) => r.needsReply);
  return rows;
}

export type ChatThreadItem =
  | { kind: "message"; id: string; authoredBy: "user" | "ai" | "admin"; text: string; emailed: boolean; createdAt: string }
  | { kind: "tool"; id: string; name: string; status: string; summary: string | null; createdAt: string };

export async function getChatConversation(sessionId: string, sinceIso?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const ag = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      contactId: true,
      mode: true,
      handlingStatus: true,
      archivedAt: true,
      startedAt: true,
      lastPolledAt: true,
      leadFirstName: true,
      leadEmail: true,
      contact: { select: { firstName: true, lastName: true } },
    },
  });
  if (!ag) return null;

  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const [messages, tools] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { sessionId, createdAt: { gt: since }, role: { in: ["user", "assistant"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, senderEmail: true, emailedAt: true, text: true, createdAt: true },
    }),
    prisma.agentToolCall.findMany({
      where: { sessionId, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, name: true, resultStatus: true, resultSummary: true, createdAt: true },
    }),
  ]);

  const items: ChatThreadItem[] = [
    ...messages.map((m): ChatThreadItem => ({
      kind: "message",
      id: m.id,
      authoredBy: m.senderEmail ? ("admin" as const) : m.role === "assistant" ? ("ai" as const) : ("user" as const),
      text: m.text,
      emailed: !!m.emailedAt,
      createdAt: m.createdAt.toISOString(),
    })),
    ...tools.map((t): ChatThreadItem => ({
      kind: "tool",
      id: t.id,
      name: t.name,
      status: t.resultStatus,
      summary: t.resultSummary,
      createdAt: t.createdAt.toISOString(),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const name =
    (ag.contact ? `${ag.contact.firstName} ${ag.contact.lastName || ""}`.trim() : "") ||
    ag.leadFirstName ||
    ag.leadEmail ||
    "Anonymous";

  return {
    session: {
      id: ag.id,
      name,
      contactId: ag.contactId,
      mode: ag.mode,
      handlingStatus: ag.handlingStatus,
      archived: !!ag.archivedAt,
      online: !!ag.lastPolledAt && Date.now() - ag.lastPolledAt.getTime() < ONLINE_THRESHOLD_MS,
    },
    items,
  };
}

export async function archiveChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { archivedAt: new Date() } });
  return { ok: true as const };
}

export async function unarchiveChatSession(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { archivedAt: null } });
  return { ok: true as const };
}
```

If ONLINE_THRESHOLD or a similar constant already exists in this file (OFFLINE_THRESHOLD_SECONDS is referenced by sendChatAdminReply), reuse/align rather than duplicating conflicting values: keep this constant but derive both from one source if trivial.

- [ ] **Step 2: Fix the badge**

In `src/actions/inbox-badges.ts`, find the query fetching `recentChatSessions` (the AgentSession findMany feeding pendingChats around line 80-95) and add `archivedAt: null` to its where clause.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass.

- [ ] **Step 4: Commit**

```bash
git add src/actions/agent-chat.ts src/actions/inbox-badges.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: admin conversation actions and archived badge fix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: API passive-poll flag

**Files:**
- Modify: `src/app/api/agent/chat/route.ts` (POST body parse + handlePoll, lines ~150-210)

- [ ] **Step 1: Thread the flag**

Read the POST handler's body parsing. Add `passive` to the parsed body (default false). Pass it to `handlePoll(sessionId, sinceMessageId, passive)` at the poll call site, and change handlePoll's signature:

```typescript
async function handlePoll(sessionId: string, sinceMessageId: string, passive = false) {
  // Closed-widget background polls must not count as "online" presence,
  // otherwise the offline email fallback for admin replies never fires.
  if (!passive) {
    await prisma.agentSession
      .update({
        where: { id: sessionId },
        data: { lastPolledAt: new Date() },
      })
      .catch(() => {});
  }
  // ... rest unchanged
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/chat/route.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: passive poll flag so closed widgets do not count as online

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin /admin/chats page

**Files:**
- Create: `src/app/admin/chats/page.tsx`
- Create: `src/app/admin/chats/chats-client.tsx`
- Modify: `src/middleware.ts` (ADMIN_PROTECTED gains "/admin/chats")
- Modify: `src/components/admin/top-nav.tsx` (CRM group: add `{ href: "/admin/chats", label: "Chats" }` after Inbox; add "/admin/chats" to the group prefixes)

- [ ] **Step 1: Server page**

```tsx
// src/app/admin/chats/page.tsx
import { PageHeader } from "@/components/admin/page-header";
import { ChatsClient } from "./chats-client";

export const dynamic = "force-dynamic";

export default function ChatsPage() {
  return (
    <div>
      <PageHeader title="Chats" description="Read and answer visitor conversations" />
      <ChatsClient />
    </div>
  );
}
```

- [ ] **Step 2: Client (complete file)**

```tsx
// src/app/admin/chats/chats-client.tsx
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
  const [rows, setRows] = useState<ChatConversationRow[] | null>(null);
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
              waitingSinceMs: row.waitingSinceMs,
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
    const t = setInterval(() => {
      const id = selectedId;
      getChatConversation(id, lastItemIsoRef.current ?? undefined)
        .then((delta) => {
          if (selectedRef.current !== id || !delta) return;
          setThread((cur) => {
            if (!cur) return cur;
            const seen = new Set(cur.items.map((i) => i.id));
            const fresh = delta.items.filter((i) => !seen.has(i.id));
            if (fresh.length && isAtBottom()) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
            if (fresh.length) lastItemIsoRef.current = fresh[fresh.length - 1].createdAt;
            return { session: delta.session, items: fresh.length ? [...cur.items, ...fresh] : cur.items };
          });
        })
        .catch(() => {});
    }, 3_000);
    return () => clearInterval(t);
  }, [selectedId]);

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
    // Pull the echo promptly.
    const id = selectedId;
    getChatConversation(id, lastItemIsoRef.current ?? undefined)
      .then((delta) => {
        if (selectedRef.current !== id || !delta) return;
        setThread((cur) => {
          if (!cur) return cur;
          const seen = new Set(cur.items.map((i) => i.id));
          const fresh = delta.items.filter((i) => !seen.has(i.id));
          if (fresh.length) lastItemIsoRef.current = fresh[fresh.length - 1].createdAt;
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
          return { session: delta.session, items: fresh.length ? [...cur.items, ...fresh] : cur.items };
        });
      })
      .catch(() => {});
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

  const selectedRow = rows?.find((r) => r.id === selectedId) ?? null;

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
              {r.needsReply && (
                <span className="inline-block mt-1 rounded-full bg-[#fef2f2] text-[#dc2626] px-2 py-0.5 text-[10px] font-bold">
                  Waiting {r.waitingSinceMs ? timeAgo(new Date(r.waitingSinceMs).toISOString()) : ""}
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
                    {item.kind === "tool" ? (
                      <ToolLine item={item} />
                    ) : (
                      <MessageBubble item={item} />
                    )}
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
      <div className={`max-w-[75%]`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
            mine
              ? "bg-[#15803d] text-white rounded-br-md"
              : item.authoredBy === "ai"
                ? "bg-white border border-[#e4e4e7] text-[#18181b] rounded-bl-md"
                : "bg-[#f4f4f5] text-[#18181b] rounded-bl-md"
          }`}
        >
          {item.authoredBy === "ai" && (
            <span className="block text-[10px] font-semibold text-[#a1a1aa] mb-0.5">AI</span>
          )}
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
```

- [ ] **Step 3: Middleware + nav**

Add `"/admin/chats",` to ADMIN_PROTECTED in src/middleware.ts. In src/components/admin/top-nav.tsx CRM group: add `"/admin/chats"` to prefixes and `{ href: "/admin/chats", label: "Chats" },` right after the Inbox item.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass; `npm run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/chats src/middleware.ts src/components/admin/top-nav.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: messenger-style chats inbox with live thread

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ChatWidget rebuild

**Files:**
- Rewrite: `src/components/chat/ChatWidget.tsx`

Keep the existing API contract (POST /api/agent/chat with `{text?, sessionId?, sinceMessageId?, passive?, lead fields}`), the localStorage keys `pennylime.chat.session` / `pennylime.chat.lead`, and the lead-capture feature. READ the current file fully first to preserve the exact request/response field names (reply shape, mode, lead submission), then rewrite with this structure:

- [ ] **Step 1: Rewrite (complete file)**

```tsx
// src/components/chat/ChatWidget.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, type ChatMsg } from "./merge-messages";

const SESSION_KEY = "pennylime.chat.session";
const LEAD_KEY = "pennylime.chat.lead";
const LAST_SEEN_KEY = "pennylime.chat.lastSeen";
const BRAND = "#15803d";

type Lead = { firstName?: string; email?: string };

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat api ${res.status}`);
  return res.json();
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center px-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full bg-[#a1a1aa] animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [text, setText] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [lead, setLead] = useState<Lead>({});
  const [leadDraft, setLeadDraft] = useState<Lead>({});
  const [firstHumanAck, setFirstHumanAck] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const inFlight = useRef(false);

  // Restore session + lead.
  useEffect(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (s) setSessionId(s);
      const l = localStorage.getItem(LEAD_KEY);
      if (l) setLead(JSON.parse(l));
    } catch {}
  }, []);

  const lastServerId = useCallback((msgs: ChatMsg[]) => {
    const settled = msgs.filter((m) => !m.pending);
    return settled.length ? settled[settled.length - 1].id : "";
  }, []);

  const isAtBottom = () => {
    const el = scrollBoxRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const applyPoll = useCallback(
    (data: { mode?: string; messages?: Array<{ id: string; text: string; authoredBy: ChatMsg["authoredBy"]; createdAt: string }> }) => {
      if (data.mode === "human" || data.mode === "ai") setMode(data.mode);
      const incoming: ChatMsg[] = (data.messages || []).map((m) => ({
        id: m.id,
        text: m.text,
        authoredBy: m.authoredBy,
        createdAt: m.createdAt,
      }));
      if (!incoming.length) return;
      setMessages((cur) => {
        const merged = mergeMessages(cur, incoming);
        if (openRef.current) {
          try { localStorage.setItem(LAST_SEEN_KEY, lastServerId(merged)); } catch {}
          if (isAtBottom()) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
        } else {
          const lastSeen = (() => { try { return localStorage.getItem(LAST_SEEN_KEY) || ""; } catch { return ""; } })();
          const unseen = merged.filter((m) => m.authoredBy !== "user" && !m.pending);
          const idx = unseen.findIndex((m) => m.id === lastSeen);
          setUnread(idx === -1 ? unseen.length : unseen.length - idx - 1);
        }
        return merged;
      });
    },
    [lastServerId]
  );

  // Open poll (2.5s) and closed passive poll (20s).
  useEffect(() => {
    if (!sessionId) return;
    const interval = open ? 2_500 : 20_000;
    const t = setInterval(() => {
      api({ sessionId, sinceMessageId: "", passive: !open })
        .then(applyPoll)
        .catch(() => {});
    }, interval);
    return () => clearInterval(t);
  }, [sessionId, open, applyPoll]);

  // Hydrate history when opening.
  useEffect(() => {
    if (!open || !sessionId) return;
    setUnread(0);
    setHydrating(true);
    api({ sessionId, sinceMessageId: "" })
      .then((d) => {
        applyPoll(d);
        setHydrating(false);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 30);
      })
      .catch(() => setHydrating(false));
  }, [open, sessionId, applyPoll]);

  const send = async () => {
    const value = text.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setText("");
    const tmpId = `tmp-${crypto.randomUUID()}`;
    const optimistic: ChatMsg = { id: tmpId, text: value, authoredBy: "user", createdAt: new Date().toISOString(), pending: true };
    setMessages((cur) => [...cur, optimistic]);
    if (mode === "ai") setAiTyping(true);
    if (mode === "human" && !firstHumanAck) setFirstHumanAck(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      const data = await api({
        text: value,
        sessionId: sessionId ?? undefined,
        leadFirstName: lead.firstName,
        leadEmail: lead.email,
      });
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        try { localStorage.setItem(SESSION_KEY, data.sessionId); } catch {}
      }
      if (data.mode === "human" || data.mode === "ai") setMode(data.mode);
      const incoming: ChatMsg[] = [];
      // Server may return the stored user message id and/or the AI reply.
      if (data.userMessage) incoming.push({ id: data.userMessage.id, text: value, authoredBy: "user", createdAt: data.userMessage.createdAt ?? new Date().toISOString() });
      if (data.reply) incoming.push({ id: data.reply.id ?? `r-${Date.now()}`, text: data.reply.text ?? data.reply, authoredBy: "ai", createdAt: data.reply.createdAt ?? new Date().toISOString() });
      setMessages((cur) => {
        // Settle the optimistic message even without a server echo shape.
        const settled = cur.map((m) => (m.id === tmpId ? { ...m, pending: incoming.some((x) => x.authoredBy === "user") } : m));
        return mergeMessages(settled, incoming);
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch {
      setMessages((cur) => cur.map((m) => (m.id === tmpId ? { ...m, pending: false, failed: true } : m)));
    } finally {
      setAiTyping(false);
      inFlight.current = false;
    }
  };

  const retry = (msg: ChatMsg) => {
    setMessages((cur) => cur.filter((m) => m.id !== msg.id));
    setText(msg.text);
  };

  const saveLead = () => {
    const next = { firstName: leadDraft.firstName?.trim() || undefined, email: leadDraft.email?.trim() || undefined };
    setLead(next);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(next)); } catch {}
    setShowLeadForm(false);
    if (sessionId && (next.firstName || next.email)) {
      api({ sessionId, leadFirstName: next.firstName, leadEmail: next.email }).catch(() => {});
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-white text-[14px] font-semibold shadow-lg"
          style={{ background: BRAND }}
          aria-label="Open chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden sm:inline">Chat with us</span>
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 rounded-full bg-[#dc2626] text-white text-[11px] font-bold flex items-center justify-center px-1">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed z-50 inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:h-[560px] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#e4e4e7]">
          <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: BRAND }}>
            <div className="flex-1">
              <p className="text-[14px] font-semibold leading-tight">PennyLime Support</p>
              <p className="text-[11px] opacity-80">{mode === "human" ? "Live agent" : "AI assistant"}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/90 hover:text-white text-[20px] leading-none" aria-label="Close chat">
              &times;
            </button>
          </div>

          <div ref={scrollBoxRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-[#fafafa]">
            {hydrating && messages.length === 0 && (
              <div className="space-y-2 pt-2">
                {[80, 60, 70].map((w, i) => (
                  <div key={i} className={`h-8 rounded-2xl bg-[#f0f0f0] animate-pulse ${i % 2 ? "ml-auto" : ""}`} style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
            {!hydrating && messages.length === 0 && (
              <p className="text-[13px] text-[#71717a] text-center pt-8">
                Hi! Ask us anything about your advance or application.
              </p>
            )}
            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const grouped = prev?.authoredBy === msg.authoredBy;
              const mine = msg.authoredBy === "user";
              return (
                <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "" : "pt-2"}`}>
                  <div className="max-w-[80%]">
                    {!grouped && msg.authoredBy === "admin" && (
                      <p className="text-[10px] text-[#71717a] mb-0.5 ml-1">PennyLime team</p>
                    )}
                    <div
                      className={`rounded-2xl px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
                        mine
                          ? "text-white rounded-br-md"
                          : msg.authoredBy === "admin"
                            ? "bg-[#dcfce7] text-[#14532d] rounded-bl-md"
                            : "bg-white border border-[#e4e4e7] text-[#18181b] rounded-bl-md"
                      } ${msg.failed ? "opacity-60" : ""}`}
                      style={mine ? { background: BRAND } : undefined}
                    >
                      {msg.text}
                    </div>
                    <p className={`text-[10px] text-[#a1a1aa] mt-0.5 ${mine ? "text-right mr-1" : "ml-1"}`}>
                      {msg.failed ? (
                        <button onClick={() => retry(msg)} className="text-[#dc2626]">Failed, tap to retry</button>
                      ) : msg.pending ? (
                        "Sending..."
                      ) : (
                        hhmm(msg.createdAt)
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
            {aiTyping && (
              <div className="flex justify-start pt-1">
                <div className="rounded-2xl bg-white border border-[#e4e4e7] px-3 py-2.5">
                  <TypingDots />
                </div>
              </div>
            )}
            {mode === "human" && firstHumanAck && (
              <p className="text-[11px] text-[#a1a1aa] text-center pt-1">Delivered. The team replies right here.</p>
            )}
            <div ref={bottomRef} />
          </div>

          {showLeadForm ? (
            <div className="border-t border-[#f4f4f5] p-3 space-y-2">
              <input
                value={leadDraft.firstName || ""}
                onChange={(e) => setLeadDraft((d) => ({ ...d, firstName: e.target.value }))}
                placeholder="Your name"
                className="w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px]"
              />
              <input
                value={leadDraft.email || ""}
                onChange={(e) => setLeadDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="Email"
                type="email"
                className="w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[13px]"
              />
              <div className="flex gap-2">
                <button onClick={saveLead} className="flex-1 rounded-lg text-white py-2 text-[13px] font-semibold" style={{ background: BRAND }}>
                  Save
                </button>
                <button onClick={() => setShowLeadForm(false)} className="rounded-lg border border-[#e4e4e7] px-3 text-[13px]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-[#f4f4f5] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={Math.min(5, Math.max(1, text.split("\n").length))}
                  placeholder={mode === "human" ? "Message the team..." : "Type your question..."}
                  className="flex-1 resize-none rounded-xl border border-[#e4e4e7] px-3 py-2 text-[14px]"
                />
                <button
                  onClick={send}
                  disabled={!text.trim()}
                  className="rounded-xl text-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-40"
                  style={{ background: BRAND }}
                  aria-label="Send"
                >
                  Send
                </button>
              </div>
              {!lead.email && (
                <button onClick={() => { setLeadDraft(lead); setShowLeadForm(true); }} className="text-[11px] text-[#71717a] hover:text-[#3f3f46] mt-1.5">
                  Save this chat to your inbox
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

IMPORTANT adaptation step: before finalizing, open the CURRENT ChatWidget.tsx and the API route and align the request/response field names in `send`, `applyPoll`, and `saveLead` with reality (the current code POSTs specific lead field names and receives a specific reply shape, e.g. `data.reply` may be a string and there may be no `data.userMessage`). Keep this file's structure but make the wire format EXACTLY what the API produces; where the API does not return the stored user message, rely on mergeMessages' pending-echo replacement via the poll. Also confirm the widget's default export vs named export matches how src/app/layout.tsx imports it.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass; `npm run build` succeeds. Then `npm run dev` and load the homepage: widget opens, sends a message, AI replies with typing dots, mobile viewport (devtools) shows the full-screen sheet. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatWidget.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: rebuild visitor widget (responsive, typing dots, unread badge)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Desktop notifications for chats

**Files:**
- Modify: `src/components/admin/top-nav.tsx` (badge poll effect, lines ~177-262)

- [ ] **Step 1: Extend the notification effect**

Read the existing effect that polls getInboxBadges and fires `new Notification(...)` for new emails. Add chat handling with the same pattern: keep a `prevPendingChats` ref (initialize on first poll without notifying, same as emails do via initialPollDone); when `badges.pendingChats` rises above the previous value after the first poll, fire:

```typescript
new Notification("New chat message", {
  body: "A visitor is waiting in the chat inbox.",
  tag: "pennylime-chats",
});
```

and make clicking it focus `/admin/chats` if the Notification click handler pattern is feasible (`n.onclick = () => { window.focus(); window.location.href = "/admin/chats"; }`). Follow the exact permission/guard style the email notification uses.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/top-nav.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: desktop notification when a chat needs a reply

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification and deploy

- [ ] **Step 1:** `npm test` all pass; `npx tsc --noEmit` zero errors; `npm run build` succeeds.
- [ ] **Step 2:** Deploy: `git push origin main`; verify `railway deployment list | head -3` reaches SUCCESS.
- [ ] **Step 3:** Manual acceptance: visitor chat from the live homepage (AI replies, typing dots); ask for a human → escalation; answer from /admin/chats (reply appears in the widget within ~3s); close the widget, admin replies again → unread badge on the launcher; archive/unarchive; hand back to AI; mobile widget full-screen; desktop notification fires when a new chat message arrives while on another admin page.

---

## Self-review notes

- Spec coverage: helpers (Task 1), actions + badge fix (Task 2), passive flag (Task 3), admin page incl. nav/middleware/filters/live poll/tool collapse/archive (Task 4), widget rebuild incl. responsive/unread/dedupe/typing/retry/lead (Task 5), notifications (Task 6), deploy (Task 7).
- Type consistency: ChatConversationRow/ChatThreadItem defined in Task 2 and consumed in Task 4; ChatMsg defined in Task 1 and consumed in Task 5; sortConversations input extends the row with waitingSinceMs/lastMessageAtMs which Task 4 supplies.
- Wire-format risk is called out explicitly in Task 5 (align with the real API before finalizing).

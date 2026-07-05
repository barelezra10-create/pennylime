# Chat Ticket Flow + Knowledge Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ticket-style statuses (Open / Waiting on client / Resolved with auto-reopen) on the admin chats inbox, and an AI knowledge loop: the agent files unanswerable questions into a queue, the admin answers once, the answer is sent to every waiting chat and becomes permanent AI knowledge.

**Architecture:** Two additive Prisma models (KnowledgeEntry, KnowledgeWaiter). A pure-tested matching module (src/lib/knowledge.ts) used by a new `askOwner` agent tool; runTurn's system prompt gains a Known-Answers section. New knowledge actions power a Knowledge tab in the existing chats client; ticket statuses ride the existing AgentSession.handlingStatus with transitions at the API route (user message → OPEN), sendChatAdminReply (→ WAITING_CLIENT), and a new setChatHandlingStatus action (Resolve/Reopen).

**Tech Stack:** Next.js 16, Prisma 7 (Postgres, hand-written additive migrations due to prod drift), Gemini agent in src/lib/ai-agent, vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-chat-tickets-knowledge-design.md`

**Conventions:** commits on main, inline identity + Co-Authored-By Claude line, no em dashes, never commit `.pl_recipients.json` / `scripts/pause-notice-send.js`. Verify each task with `npx tsc --noEmit` (zero errors) and `npm test`.

**CRITICAL migration rule for this repo:** the production DB has known drift (SocialComment default), so `prisma migrate dev` proposes a reset. NEVER accept a reset. Pattern: add models to schema.prisma, create the migration folder by hand (timestamped like siblings) with additive-only SQL, apply with `npx prisma migrate deploy`, then `npx prisma generate`.

---

### Task 1: Schema (KnowledgeEntry + KnowledgeWaiter)

**Files:**
- Modify: `prisma/schema.prisma` (append both models at the end, near the other Agent* models)
- Create: `prisma/migrations/<timestamp>_add_knowledge_entries/migration.sql` (hand-written)

- [ ] **Step 1: Add to schema.prisma**

```prisma
model KnowledgeEntry {
  id         String   @id @default(uuid())
  question   String
  answer     String?
  status     String   @default("PENDING") // PENDING | ANSWERED | DISABLED
  timesSent  Int      @default(0)
  answeredBy String?
  answeredAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  waiters    KnowledgeWaiter[]

  @@index([status, createdAt])
}

model KnowledgeWaiter {
  id         String   @id @default(uuid())
  entryId    String
  entry      KnowledgeEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  sessionId  String
  notifiedAt DateTime?
  createdAt  DateTime @default(now())

  @@unique([entryId, sessionId])
  @@index([sessionId])
}
```

- [ ] **Step 2: Hand-write the migration**

Create `prisma/migrations/20260705100000_add_knowledge_entries/migration.sql` containing ONLY `CREATE TABLE "KnowledgeEntry"`, `CREATE TABLE "KnowledgeWaiter"`, the FK constraint with ON DELETE CASCADE, the unique index, and the two regular indexes, matching Prisma's naming conventions ("KnowledgeEntry_status_createdAt_idx", "KnowledgeWaiter_entryId_sessionId_key", "KnowledgeWaiter_sessionId_idx", FK "KnowledgeWaiter_entryId_fkey"). Mirror column types from a sibling migration (TEXT, TIMESTAMP(3), INTEGER, CURRENT_TIMESTAMP default).

- [ ] **Step 3: Apply + generate**

Run: `npx prisma migrate deploy` (applies only pending migrations; expect the new one applied). Then `npx prisma generate`.
NEVER run `migrate dev`; NEVER accept a reset.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` zero errors; quick read check: `npx prisma migrate status` shows the migration applied.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "db: knowledge entries and waiters for the AI learning loop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Knowledge lib (TDD for the pure parts)

**Files:**
- Create: `src/lib/knowledge.ts`
- Test: `src/lib/knowledge.test.ts`

- [ ] **Step 1: Failing tests for the pure helpers**

```typescript
// src/lib/knowledge.test.ts
import { describe, it, expect } from "vitest";
import { normalizeQuestion, questionsMatch } from "./knowledge";

describe("normalizeQuestion", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeQuestion("  When do LATE fees start?! ")).toBe("when do late fees start");
  });
});

describe("questionsMatch", () => {
  it("matches identical normalized questions", () => {
    expect(questionsMatch("When do late fees start?", "when DO late fees start")).toBe(true);
  });
  it("matches when one contains the other (min length guard)", () => {
    expect(questionsMatch("late fees", "when do late fees start")).toBe(true);
  });
  it("does not match short or unrelated questions", () => {
    expect(questionsMatch("hi", "when do late fees start")).toBe(false);
    expect(questionsMatch("how do I change my bank", "when do late fees start")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `npx vitest run src/lib/knowledge.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/knowledge.ts
import "server-only";
import { prisma } from "@/lib/db";

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same question when normalized forms are equal, or one contains the other (both non-trivial). */
export function questionsMatch(a: string, b: string): boolean {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 8 && longer.includes(shorter);
}

/**
 * Files a question the AI could not answer. Dedupes into an existing
 * PENDING entry when the question matches; attaches the session as a
 * waiter either way. Returns the entry id.
 */
export async function recordOwnerQuestion(sessionId: string, question: string): Promise<string> {
  const q = question.trim().slice(0, 500);
  const pending = await prisma.knowledgeEntry.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, question: true },
  });
  const match = pending.find((p) => questionsMatch(p.question, q));
  const entryId = match
    ? match.id
    : (await prisma.knowledgeEntry.create({ data: { question: q }, select: { id: true } })).id;

  await prisma.knowledgeWaiter.upsert({
    where: { entryId_sessionId: { entryId, sessionId } },
    create: { entryId, sessionId },
    update: {},
  });
  return entryId;
}

/** ANSWERED entries for the system prompt, newest first, capped. */
export async function getAnsweredKnowledge(limit = 50): Promise<Array<{ question: string; answer: string }>> {
  const rows = await prisma.knowledgeEntry.findMany({
    where: { status: "ANSWERED", answer: { not: null } },
    orderBy: { answeredAt: "desc" },
    take: limit,
    select: { question: true, answer: true },
  });
  return rows.map((r) => ({ question: r.question, answer: r.answer as string }));
}
```

If `import "server-only"` breaks the vitest run, mock it in the test file the way src/lib/voice/signature.test.ts does (vi.mock("server-only", ...)); also mock "@/lib/db" if module resolution requires it.

- [ ] **Step 4: Run, verify PASS (4 tests), then full `npm test`.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge.ts src/lib/knowledge.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "knowledge: question matching and owner-question recording

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: askOwner agent tool + system prompt knowledge

**Files:**
- Create: `src/lib/ai-agent/tools/askOwner.ts`
- Test: `src/lib/ai-agent/tools/askOwner.test.ts`
- Modify: `src/lib/ai-agent/tools/index.ts` (register the tool)
- Modify: `src/lib/ai-agent/systemPrompt.ts` (knowledge section)
- Modify: `src/lib/ai-agent/runTurn.ts` (fetch knowledge, pass to prompt builder)

- [ ] **Step 1: Study the pattern**

READ two existing tools fully (e.g. getStateRules.ts simple, escalateToTicket.ts session-writing) plus tools/index.ts and one tool test. Match: declaration shape (name, description, parameters JSON schema), executor signature and context (sessionId available?), auth gating (askOwner must be available at EVERY auth level, like escalateToTicket presumably is), redaction handling, and how tests are structured (mocks for prisma).

- [ ] **Step 2: Implement askOwner following that pattern exactly**

Behavior: description tells the model to use it when the question is not covered by other tools or the known answers; parameters {question: string (required)}. Executor: call `recordOwnerQuestion(ctx.sessionId, args.question)` (import from "@/lib/knowledge"); on success return a result string like: "The team has been asked. Tell the user: good question, I have asked the PennyLime team and their answer will appear right here in this chat (and by email if they leave one). Do not invent an answer."; on DB error, catch and return: "Could not reach the team queue. Apologize and suggest emailing support@pennylime.com." Write the test following a sibling test's mocking style (assert entry creation path and error path).

- [ ] **Step 3: System prompt knowledge section**

In runTurn.ts, before building the system prompt, fetch `getAnsweredKnowledge()` inside try/catch (on failure use []). Pass it to buildSystemPrompt (extend its input type). In systemPrompt.ts, when entries exist, append:

```
## Known answers from the PennyLime team
Use these authoritative answers when relevant. Do not contradict them.
Q: {question}
A: {answer}
(...)
If the user's question is not covered by your tools or these known answers, call askOwner instead of guessing.
```

Include the final instruction line even when the list is empty (so the model always knows askOwner exists).

- [ ] **Step 4: Verify**

`npx tsc --noEmit` zero; `npm test` all pass (including the new tool test and the existing runTurn/index tests, which may need their expected-tool-list updated if index.test.ts asserts tool names).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-agent
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "agent: askOwner tool and learned-knowledge prompt section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Knowledge admin actions

**Files:**
- Create: `src/actions/knowledge.ts`

- [ ] **Step 1: Implement (session-gated like src/actions/agent-chat.ts)**

```typescript
"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type KnowledgeRow = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  timesSent: number;
  waiterCount: number;
  pendingWaiterCount: number;
  createdAt: string;
  answeredAt: string | null;
};

export async function listKnowledge(status: "PENDING" | "ANSWERED" | "DISABLED"): Promise<KnowledgeRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  const rows = await prisma.knowledgeEntry.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { waiters: { select: { notifiedAt: true } } },
  });
  const mapped = rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    status: r.status,
    timesSent: r.timesSent,
    waiterCount: r.waiters.length,
    pendingWaiterCount: r.waiters.filter((w) => !w.notifiedAt).length,
    createdAt: r.createdAt.toISOString(),
    answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
  }));
  if (status === "PENDING") mapped.sort((a, b) => b.pendingWaiterCount - a.pendingWaiterCount || a.createdAt.localeCompare(b.createdAt));
  return mapped;
}

export async function answerKnowledgeEntry(entryId: string, answer: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const text = answer.trim();
  if (!text) return { ok: false as const, error: "Answer required" };

  const entry = await prisma.knowledgeEntry.update({
    where: { id: entryId },
    data: { answer: text, status: "ANSWERED", answeredBy: session.user.email, answeredAt: new Date() },
    include: { waiters: { where: { notifiedAt: null } } },
  });

  let sent = 0;
  let emailed = 0;
  for (const waiter of entry.waiters) {
    const ag = await prisma.agentSession.findUnique({
      where: { id: waiter.sessionId },
      select: {
        id: true,
        archivedAt: true,
        lastPolledAt: true,
        leadFirstName: true,
        leadEmail: true,
        contact: { select: { firstName: true, email: true } },
      },
    });
    if (!ag || ag.archivedAt) {
      await prisma.knowledgeWaiter.update({ where: { id: waiter.id }, data: { notifiedAt: new Date() } });
      continue;
    }
    const msg = await prisma.agentMessage.create({
      data: { sessionId: ag.id, role: "assistant", senderEmail: null, text },
    });
    await prisma.agentSession.update({ where: { id: ag.id }, data: { handlingStatus: "WAITING_CLIENT" } });
    sent++;

    const offline = !ag.lastPolledAt || Date.now() - ag.lastPolledAt.getTime() > 30_000;
    const toEmail = ag.contact?.email ?? ag.leadEmail;
    if (offline && toEmail) {
      const toName = ag.contact?.firstName ?? ag.leadFirstName ?? "there";
      const { sendEmail } = await import("@/lib/email-sender");
      try {
        await sendEmail({
          to: toEmail,
          subject: "You have a reply from PennyLime",
          html: `<p>Hi ${toName},</p><p>You asked us: <em>${entry.question}</em></p><p>${text}</p><p>You can reply any time by reopening the chat at pennylime.com.</p>`,
        });
        await prisma.agentMessage.update({ where: { id: msg.id }, data: { emailedAt: new Date() } });
        emailed++;
      } catch {}
    }
    await prisma.knowledgeWaiter.update({ where: { id: waiter.id }, data: { notifiedAt: new Date() } });
  }

  await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { timesSent: { increment: sent } } });
  return { ok: true as const, sent, emailed };
}

export async function updateKnowledgeAnswer(entryId: string, answer: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const text = answer.trim();
  if (!text) return { ok: false as const, error: "Answer required" };
  await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { answer: text } });
  return { ok: true as const };
}

export async function setKnowledgeStatus(entryId: string, status: "ANSWERED" | "DISABLED") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.knowledgeEntry.update({ where: { id: entryId }, data: { status } });
  return { ok: true as const };
}
```

IMPORTANT adaptation: check the real email-sending helper before using it. `src/lib/email-sender.ts` exists; READ its exported function name and signature (it may be `sendEmail({to, subject, html})` or different) and how sendChatAdminReply in src/actions/agent-chat.ts sends its offline email (it may use a different helper + escapeHtml). Reuse the same helper and escape the interpolated question/answer/name the way agent-chat.ts does. Also confirm the escape helper's location.

- [ ] **Step 2: Verify.** `npx tsc --noEmit`; `npm test`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/knowledge.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "knowledge: admin actions (list, answer and broadcast, edit, disable)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ticket flow (subject + status transitions + Resolve)

**Files:**
- Modify: `src/actions/agent-chat.ts` (subject in list/get; new setChatHandlingStatus; WAITING_CLIENT on admin reply)
- Modify: `src/app/api/agent/chat/route.ts` (user message → handlingStatus OPEN)

- [ ] **Step 1: Subject**

In `listChatConversations` and `getChatConversation`, fetch the FIRST user message per session (`messages` where role "user" orderBy createdAt asc take 1 as a second nested select in the list query; a separate findFirst in getChatConversation) and expose `subject: string` (first user message text truncated to 80 chars, or "New conversation" when none) on ChatConversationRow and the thread session object.

- [ ] **Step 2: Transitions**

- In the API route's user-message branch (both mode human store-only and mode ai paths; find where the user AgentMessage is created), also update the session: `handlingStatus: "OPEN"`.
- In sendChatAdminReply, where mode is set to "human", also set `handlingStatus: "WAITING_CLIENT"`.
- New action in agent-chat.ts:

```typescript
export async function setChatHandlingStatus(sessionId: string, status: "OPEN" | "WAITING_CLIENT" | "RESOLVED") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { handlingStatus: status } });
  return { ok: true as const };
}
```

- [ ] **Step 3: List filters**

Change `listChatConversations`'s filter type to `"needs-reply" | "open" | "resolved" | "all" | "archived"`: open = archivedAt null AND handlingStatus != "RESOLVED"; resolved = archivedAt null AND handlingStatus "RESOLVED"; all = archivedAt null; archived unchanged; needs-reply = open + post-filter needsReply (as today).

- [ ] **Step 4: Verify.** `npx tsc --noEmit`; `npm test`; also confirm existing status-controls under /admin/agent/sessions still compile (they may use their own action; do not break them).

- [ ] **Step 5: Commit**

```bash
git add src/actions/agent-chat.ts src/app/api/agent/chat/route.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: ticket statuses (auto-reopen, waiting-on-client, resolve) and subjects

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Chats client UI (ticket rows + Knowledge tab)

**Files:**
- Modify: `src/app/admin/chats/chats-client.tsx`
- Create: `src/app/admin/chats/knowledge-panel.tsx`

- [ ] **Step 1: Ticket rows and statuses in chats-client.tsx**

- Filters: replace with Needs reply / Open / Resolved / All / Archived mapping to the new action filter keys; default stays "needs-reply".
- List row: line 1 = bold subject (truncate) + status chip right-aligned; line 2 = name (secondary, gray) + online dot; line 3 = last-message preview + time ago; keep the Waiting badge.
- Status chip helper: OPEN → red bg #fef2f2 text #dc2626 "Open" (only when needsReply, else neutral gray "Open"); WAITING_CLIENT → amber bg #fef9ec text #b45309 "Waiting on client"; RESOLVED → green bg #f0fdf4 text #15803d "Resolved".
- Thread header: subject as the title (name beside it in gray), status chip, and a Resolve button (green) when not RESOLVED / a Reopen button when RESOLVED, calling setChatHandlingStatus then refreshing thread + list.
- Add a top-level segmented switch above everything: `Conversations | Knowledge` (client state). Knowledge renders `<KnowledgePanel />`.

- [ ] **Step 2: knowledge-panel.tsx (complete new file)**

Client component:
- Two sections with a small sub-tab or stacked layout: "Waiting for your answer" (listKnowledge("PENDING")) and "Learned answers" (listKnowledge("ANSWERED")).
- Pending card: question (bold, 14px), "N clients waiting" red badge (pendingWaiterCount), textarea (auto-grow), "Save & send" button → answerKnowledgeEntry(id, text) → success note "Sent to N chats (M also emailed)" and the card moves to Learned on refetch; "Dismiss" (setKnowledgeStatus(id, "DISABLED")).
- Learned row: question bold, answer below in an inline-editable textarea with a Save button (updateKnowledgeAnswer), "sent {timesSent}x" gray note, Disable button (setKnowledgeStatus DISABLED). Empty states for both sections.
- Refetch both lists after any mutation; poll pending every 30s.
- Style with the same Tailwind tokens as the rest of the admin (white cards, #e4e4e7 borders, 13-14px text).

- [ ] **Step 3: Verify.** `npx tsc --noEmit`; `npm test`; `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/chats
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin chats: ticket-style rows, resolve flow, knowledge tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification and deploy (whole chat redesign + tickets + knowledge)

- [ ] **Step 1:** `npm test`; `npx tsc --noEmit`; `npm run build` - all green.
- [ ] **Step 2:** Deploy: `git push origin main`; watch `railway deployment list | head -3` to SUCCESS (short 502 boot window; migration for knowledge tables already applied to prod DB in Task 1, so migrate deploy records it as applied).
- [ ] **Step 3:** Manual acceptance: new widget on the homepage (open, AI reply with typing dots, mobile sheet); /admin/chats ticket list (subjects, chips), reply → WAITING_CLIENT, visitor reply → back to OPEN, Resolve → leaves queue; Knowledge: ask the AI something it cannot know from two sessions, both attach to one pending entry, answer once → both chats get the reply, a third session asking the same gets answered instantly from knowledge.

---

## Self-review notes

- Spec coverage: schema (T1), matching + recording lib (T2), tool + prompt (T3), admin actions incl. broadcast + email fallback (T4), statuses/subject/transitions (T5), UI incl. Knowledge tab (T6), deploy (T7).
- Idempotency: notifiedAt guard prevents double-broadcast; waiter upsert prevents duplicate waiters; route status update is a plain set (safe on retries).
- Type consistency: KnowledgeRow consumed by knowledge-panel; ChatConversationRow gains subject (T5) consumed in T6; setChatHandlingStatus signature shared by T5/T6.
- Email helper name flagged for verification in T4 (must reuse the real helper + escaping from agent-chat.ts).

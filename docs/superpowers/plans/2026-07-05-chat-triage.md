# Chat Single View + Read/Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One chat surface under CRM with unread bolding and a Done / Keep working triage; AI Support tab folded into CRM sub-items.

**Architecture:** One nullable AgentSession.adminLastReadAt column (hand-written additive migration), markChatRead + unread flag in the existing agent-chat actions, small UI changes in chats-client.tsx, and a nav edit.

**Tech Stack:** Next.js 16, Prisma 7 (migrate deploy pattern due to prod drift), existing /admin/chats client.

**Spec:** `docs/superpowers/specs/2026-07-05-chat-triage-design.md`

**Conventions:** commits on main, inline identity + Co-Authored-By Claude, no em dashes, don't commit .pl_recipients.json / scripts/pause-notice-send.js. Verify: `npx tsc --noEmit` zero, `npm test` green.

---

### Task 1: Schema + read-tracking actions

**Files:**
- Modify: `prisma/schema.prisma` (AgentSession gains `adminLastReadAt DateTime?`)
- Create: `prisma/migrations/20260705160000_add_admin_last_read/migration.sql` with exactly: `ALTER TABLE "AgentSession" ADD COLUMN "adminLastReadAt" TIMESTAMP(3);`
- Modify: `src/actions/agent-chat.ts`

- [ ] **Step 1:** Add the field to the AgentSession model (near lastPolledAt). Hand-write the migration (additive only). Apply with `npx prisma migrate deploy` (NEVER migrate dev, NEVER accept a reset), then `npx prisma generate`.
- [ ] **Step 2:** In agent-chat.ts:
  - Add action:
```typescript
export async function markChatRead(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.agentSession.update({ where: { id: sessionId }, data: { adminLastReadAt: new Date() } });
  return { ok: true as const };
}
```
  - `listChatConversations`: select adminLastReadAt; add `unread: boolean` to ChatConversationRow = `!!last && (!s.adminLastReadAt || last.createdAt.getTime() > s.adminLastReadAt.getTime())`.
  - `sendChatAdminReply`: in the session update that sets mode/handlingStatus, also set `adminLastReadAt: new Date()`.
- [ ] **Step 3:** `npx tsc --noEmit`; `npm test`; `npx prisma migrate status` up to date.
- [ ] **Step 4:** Commit:
```bash
git add prisma/schema.prisma prisma/migrations src/actions/agent-chat.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "chat: admin read tracking (adminLastReadAt, unread flag)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Nav consolidation

**Files:**
- Modify: `src/components/admin/top-nav.tsx`

- [ ] **Step 1:** Delete the entire "support" tab object (id: "support", label "AI Support"). Extend the CRM group: prefixes gain "/admin/agent" and "/admin/tickets"; subnav gains, after Chats: `{ href: "/admin/tickets", label: "Tickets" }, { href: "/admin/agent/metrics", label: "AI metrics" }, { href: "/admin/agent/sessions", label: "Sessions (advanced)" }`.
- [ ] **Step 2:** Check findActiveTab longest-prefix logic still routes /admin/agent/* and /admin/tickets to CRM (it will; no other tab claims those prefixes). `npx tsc --noEmit`.
- [ ] **Step 3:** Commit:
```bash
git add src/components/admin/top-nav.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: fold AI Support into CRM, chats is the one chat surface

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Triage UI

**Files:**
- Modify: `src/app/admin/chats/chats-client.tsx`

- [ ] **Step 1:** READ the file. Changes:
  - Import markChatRead from actions.
  - List row: when `r.unread`, render a blue dot (h-2 w-2 rounded-full bg-[#2563eb]) before the subject and make the subject `font-bold text-[#18181b]`; otherwise current styling.
  - `openThread`: after loading the thread successfully, call `void markChatRead(id)` and refresh the list (loadList(filter)) so the bolding clears.
  - Thread 3s poll (appendDelta): when fresh.length > 0 and the thread is the selected one, also `void markChatRead(id)`.
  - Header buttons when handlingStatus !== "RESOLVED": replace the single Resolve button with two: **Done** (bg-[#15803d] text-white, calls the existing handleResolve which sets RESOLVED) and **Keep working** (border, calls a new handler: actionBusy guard → markChatRead → loadList(filter); no status change; on !res.ok show actionError). Keep Reopen for RESOLVED unchanged; keep Archive and Hand back to AI.
- [ ] **Step 2:** `npx tsc --noEmit`; `npm test`; `npm run build`.
- [ ] **Step 3:** Commit:
```bash
git add src/app/admin/chats/chats-client.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin chats: unread bolding and Done / Keep working triage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verify + deploy

- [ ] **Step 1:** `npm test`; `npx tsc --noEmit`; `npm run build` all green.
- [ ] **Step 2:** `git push origin main`; watch Railway to SUCCESS; curl /admin/chats (expect 307 to login) and / (200).

---

## Self-review notes
- Spec coverage: read tracking (T1), nav (T2), UI bolding + triage (T3), deploy (T4). Done-archive requirement is satisfied by the existing Resolved filter (no code).
- unread excludes admin self-replies because sendChatAdminReply bumps adminLastReadAt in the same update.

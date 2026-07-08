# Support Team Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Role-restricted /support workspace (Chats, Emails with in-app reply, Tickets) for SUPPORT-role agents; SUPPORT users can access nothing else; money actions gain explicit ADMIN-only guards.

**Architecture:** Add role to the next-auth JWT (no callbacks exist yet), gate in middleware (SUPPORT → only /support, redirect elsewhere), and a `requireNonSupportRole` guard on the money actions. /support is its own route tree with a slim layout; Chats reuses ChatsClient; Emails reuses inbox actions + a new reply action over Resend; Tickets get list/status/assign actions.

**Tech Stack:** Next.js 16, next-auth (JWT strategy, CredentialsProvider on AdminUser which already has `role`), Prisma, Resend via src/lib/emails/send.

**Spec:** `docs/superpowers/specs/2026-07-08-support-dashboard-design.md`

**Conventions:** commits on main with inline identity + Co-Authored-By Claude line; no em dashes; never commit .pl_recipients.json / scripts/pause-notice-send.js; verify with `npx tsc --noEmit` (zero) and `npm test`.

**Facts (verified):**
- src/lib/auth.ts authorize() returns `{ id, email, name }` only; NO jwt/session callbacks exist; session strategy JWT, 12h.
- Existing roles in the wild: "ADMIN", "REP" (team page select offers both). Only "SUPPORT" becomes restricted; ADMIN/REP/missing keep full access.
- Middleware: ADMIN_PROTECTED prefix list + getToken presence check only.
- Inbox: InboundEmail (status UNREAD|READ|REPLIED|ARCHIVED, fromEmail, subject, bodyText/bodyHtml, contactId); actions getInbox(filter)/getInboxMessage(id)/setInboxStatus in src/actions/inbox.ts.
- Outbound: `sendEmail({to, subject, html, ...})` from @/lib/emails/send (Resend; FROM env-configured; replyTo info@pennylime.com).
- SupportTicket: id, sessionId, contactId, reason, transcript, status (default "open"), assignedTo (unused), createdAt; /admin/tickets is a read-only server page.
- ChatsClient: self-contained client component at src/app/admin/chats/chats-client.tsx (actions all session-gated).
- Team page role select: add "SUPPORT" option (both the create form and the per-row select in src/app/admin/team/team-client.tsx).

---

### Task 1: RBAC core (JWT role, middleware gate, money-action guards)

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/auth-helpers.ts`
- Test: `src/lib/auth-helpers.test.ts`
- Modify: `src/middleware.ts`
- Modify: `src/actions/payments.ts` (chargePaymentNow, retryPayment, chargePartialPayment, waiveLateFee)
- Modify: `src/app/admin/team/team-client.tsx` (add SUPPORT to both role selects)

- [ ] **Step 1: auth.ts** - authorize() selects and returns `role: user.role`; add callbacks:
```typescript
callbacks: {
  async jwt({ token, user }) {
    if (user) token.role = (user as { role?: string }).role ?? "ADMIN";
    return token;
  },
  async session({ session, token }) {
    if (session.user) (session.user as { role?: string }).role = (token.role as string) ?? "ADMIN";
    return session;
  },
},
```
If a next-auth module augmentation exists use it; otherwise the inline casts above are acceptable (match file style).

- [ ] **Step 2: auth-helpers.ts (TDD the pure part)**

Test first:
```typescript
// src/lib/auth-helpers.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isSupportRole } from "./auth-helpers";

describe("isSupportRole", () => {
  it("only SUPPORT is restricted", () => {
    expect(isSupportRole("SUPPORT")).toBe(true);
    expect(isSupportRole("ADMIN")).toBe(false);
    expect(isSupportRole("REP")).toBe(false);
    expect(isSupportRole(undefined)).toBe(false);
    expect(isSupportRole(null)).toBe(false);
  });
});
```

Implementation:
```typescript
// src/lib/auth-helpers.ts
import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Only the SUPPORT role is restricted; ADMIN, REP, and legacy sessions without a role keep full access. */
export function isSupportRole(role: string | null | undefined): boolean {
  return role === "SUPPORT";
}

/** Guard for money-moving actions: rejects SUPPORT sessions, passes everyone else authenticated. */
export async function requireNonSupportRole(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };
  const role = (session.user as { role?: string }).role;
  if (isSupportRole(role)) return { ok: false, error: "Not permitted for support role" };
  return { ok: true, email: session.user.email };
}
```

- [ ] **Step 3: money guards** - in each of chargePaymentNow, retryPayment, chargePartialPayment, waiveLateFee (src/actions/payments.ts), replace the leading getServerSession gate with `const auth = await requireNonSupportRole(); if (!auth.ok) return { success: false, error: auth.error };` (keep using auth.email where the action used session.user.email). Read each action; keep return shapes identical.

- [ ] **Step 4: middleware** - add `"/support"` handling in src/middleware.ts:
```typescript
// inside middleware(), before the admin gate:
if (pathname.startsWith("/support")) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("callbackUrl", "/support");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
// existing admin gate: after resolving the token for an ADMIN_PROTECTED path, add:
if (token && (token as { role?: string }).role === "SUPPORT") {
  const url = request.nextUrl.clone();
  url.pathname = "/support";
  url.search = "";
  return NextResponse.redirect(url);
}
```
Integrate with the existing code style (it already clones URLs for the login redirect). Confirm the middleware `matcher`/config covers /support (check the exported config; extend if it restricts paths).

- [ ] **Step 5: team page** - add `<option value="SUPPORT">Support</option>` to both selects in team-client.tsx.

- [ ] **Step 6: Verify** - `npx vitest run src/lib/auth-helpers.test.ts` (new test passes), `npm test`, `npx tsc --noEmit`.

- [ ] **Step 7: Commit**
```bash
git add src/lib/auth.ts src/lib/auth-helpers.ts src/lib/auth-helpers.test.ts src/middleware.ts src/actions/payments.ts src/app/admin/team/team-client.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "auth: SUPPORT role restricted to /support, money actions admin-only

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Support shell + Chats tab

**Files:**
- Create: `src/app/support/layout.tsx`
- Create: `src/app/support/page.tsx`
- Create: `src/app/support/support-shell.tsx`

- [ ] **Step 1: layout.tsx** (server component): getServerSession; if no session render children (middleware handles redirect); else render a slim chrome: white top bar with "PennyLime Support" wordmark (text, brand green accent), the agent's name/email right-aligned, and a Sign out button (small client component using next-auth/react signOut({ callbackUrl: "/admin/login" })). Below: `<main className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</main>`. Background #f8f8f6.

- [ ] **Step 2: page.tsx + support-shell.tsx**: page renders `<SupportShell />` (force-dynamic). SupportShell ("use client"):
  - Counter row polling getInboxBadges (src/actions/inbox-badges.ts, session-gated read - fine for support) every 30s: three stat chips "Chats waiting {pendingChats}", "Unread emails {unrepliedEmails}", "Open tickets {openTickets}" - openTickets comes from a tiny new session-gated action `countOpenTickets()` in src/actions/tickets.ts (created in Task 4; for THIS task stub the chip with the value from listSupportTickets? NO - to keep tasks independent, add countOpenTickets in Task 4 and render the tickets chip only when the function exists... simplest: build SupportShell in this task with tabs Chats | Emails | Tickets where Emails and Tickets render "Coming in the next commit" placeholders, and the counters row shows the two badge-based chips; Task 4 wires the third chip. This is an intra-plan sequencing placeholder, acceptable because Tasks 3 and 4 land before deploy (Task 5 verifies no placeholders remain).
  - Tabs (client state): Chats renders `<ChatsClient />` imported from "@/app/admin/chats/chats-client".
- [ ] **Step 3: Verify** - `npx tsc --noEmit`; `npm test`; `npm run build`.
- [ ] **Step 4: Commit**
```bash
git add src/app/support
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "support: workspace shell with chats tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Emails tab with in-app reply

**Files:**
- Modify: `src/actions/inbox.ts` (add replyToInboundEmail)
- Create: `src/app/support/emails-panel.tsx`
- Modify: `src/app/support/support-shell.tsx` (mount EmailsPanel)

- [ ] **Step 1: replyToInboundEmail** in src/actions/inbox.ts (READ the file + @/lib/emails/send signature + how agent-chat.ts escapes HTML first):
```typescript
export async function replyToInboundEmail(emailId: string, body: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const text = body.trim();
  if (!text) return { ok: false as const, error: "Reply required" };
  if (text.length > 10_000) return { ok: false as const, error: "Reply too long" };

  const email = await prisma.inboundEmail.findUnique({ where: { id: emailId } });
  if (!email) return { ok: false as const, error: "Email not found" };

  const subject = /^re:/i.test(email.subject || "") ? (email.subject as string) : `Re: ${email.subject || "your message"}`;
  const html = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("");
  const res = await sendEmail({ to: email.fromEmail, subject, html });
  if (!res.success) return { ok: false as const, error: "Send failed" };

  await prisma.inboundEmail.update({ where: { id: emailId }, data: { status: "REPLIED" } });
  if (email.contactId) {
    await prisma.activity.create({
      data: { contactId: email.contactId, type: "email", title: "Support reply", details: text.slice(0, 5000), performedBy: session.user.email },
    }).catch(() => {});
  }
  return { ok: true as const };
}
```
Adapt to the file's actual imports (getServerSession/authOptions may need adding; sendEmail import; escapeHtml - copy the local helper pattern used in agent-chat.ts if none is importable). Verify sendEmail's result shape ({success: boolean}).

- [ ] **Step 2: emails-panel.tsx** ("use client"): two-pane like the admin inbox but with reply. Left: filter pills Unread / All / Replied / Archived mapping onto getInbox's filter param (READ src/actions/inbox.ts:21 for the exact filter values it accepts and reuse them; add mapping client-side if names differ), list rows (fromName/fromEmail, subject, time ago, unread bold). Right: selected email (subject, from, receivedAt, bodyHtml via the same sanitized rendering the admin inbox uses at src/app/admin/inbox/inbox-client.tsx ~line 246 - replicate its approach exactly, including dangerouslySetInnerHTML usage, it is the established pattern), Archive / Mark unread buttons (setInboxStatus), and a reply composer: textarea (Enter newline; explicit Send button), busy state, inline error, on success a green "Replied" note + refresh list/detail. 30s list polling.
- [ ] **Step 3:** Mount in support-shell.tsx replacing the Emails placeholder.
- [ ] **Step 4: Verify** - `npx tsc --noEmit`; `npm test`; `npm run build`.
- [ ] **Step 5: Commit**
```bash
git add src/actions/inbox.ts src/app/support
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "support: email inbox with in-app replies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Tickets tab

**Files:**
- Create: `src/actions/tickets.ts`
- Create: `src/app/support/tickets-panel.tsx`
- Modify: `src/app/support/support-shell.tsx` (mount TicketsPanel + wire the open-tickets counter chip)

- [ ] **Step 1: actions** (session-gated, any role):
```typescript
"use server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type TicketRow = {
  id: string;
  sessionId: string | null;
  contactName: string | null;
  reason: string;
  transcript: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
};

export async function listSupportTickets(filter: "open" | "mine" | "unassigned" | "closed" | "all"): Promise<TicketRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  const me = session.user.email;
  const where: Record<string, unknown> = {};
  if (filter === "open") where.status = "open";
  if (filter === "closed") where.status = "closed";
  if (filter === "mine") { where.assignedTo = me; where.status = "open"; }
  if (filter === "unassigned") { where.assignedTo = null; where.status = "open"; }
  const rows = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { contact: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    contactName: t.contact ? `${t.contact.firstName} ${t.contact.lastName || ""}`.trim() : null,
    reason: t.reason,
    transcript: t.transcript,
    status: t.status,
    assignedTo: t.assignedTo,
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function setTicketStatus(id: string, status: "open" | "closed") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.supportTicket.update({ where: { id }, data: { status } });
  return { ok: true as const };
}

export async function assignTicketToMe(id: string, assign: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  await prisma.supportTicket.update({ where: { id }, data: { assignedTo: assign ? session.user.email : null } });
  return { ok: true as const };
}

export async function countOpenTickets(): Promise<number> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  return prisma.supportTicket.count({ where: { status: "open" } });
}
```
Verify SupportTicket field names/relations against prisma/schema.prisma (~line 1370) before finalizing (reason/transcript may be nullable; adjust types).

- [ ] **Step 2: tickets-panel.tsx**: filter pills (Open default / Mine / Unassigned / Closed / All); ticket cards: reason (bold), contact name, created time-ago, status chip (open red / closed gray), assignedTo ("you" highlighted); buttons: Assign to me / Unassign, Close / Reopen; "View transcript" expands a scrollable pre-wrap block inline. Busy/error handling per card kept simple (single busy flag). Refetch after mutations; poll 30s.
- [ ] **Step 3:** Mount in support-shell; wire the "Open tickets" counter chip via countOpenTickets in the same 30s poll.
- [ ] **Step 4: Verify** - `npx tsc --noEmit`; `npm test`; `npm run build`. Grep the support tree for any remaining "Coming in the next commit" placeholder text - must be gone.
- [ ] **Step 5: Commit**
```bash
git add src/actions/tickets.ts src/app/support
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "support: tickets queue with assignment and status flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification + deploy

- [ ] **Step 1:** `npm test`; `npx tsc --noEmit`; `npm run build` all green.
- [ ] **Step 2:** Final whole-feature review (controller dispatches it), then `git push origin main`; watch Railway to SUCCESS; curl checks: /support → 307 to login when anonymous; / → 200.
- [ ] **Step 3:** Manual acceptance (Bar): create a SUPPORT user on /admin/team; incognito login → lands on /support; /admin/contacts bounces back; chats/emails/tickets flows; charge actions rejected for support; everything unchanged for ADMIN.

---

## Self-review notes

- Spec coverage: RBAC + guards (T1), shell + chats (T2), emails + reply (T3), tickets + counters (T4), deploy (T5).
- Legacy-session safety: token without role treated as full access everywhere (jwt callback only sets role at sign-in; middleware only restricts role === "SUPPORT").
- The Task 2 placeholder tabs are explicitly removed by Task 4 Step 4's grep check before deploy.
- Type consistency: TicketRow consumed by tickets-panel; requireNonSupportRole return shape used in payments actions matches their {success:false,error} style via mapping.

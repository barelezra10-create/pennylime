# Support Team Dashboard - Design Spec

Date: 2026-07-08
Status: Approved by Bar (conversation)

## Summary

A role-restricted support workspace at /support where SUPPORT-role agents manage chats, inbound emails (with in-app replies), and tickets, Zendesk-style. ADMIN users keep full access everywhere; SUPPORT users can access ONLY /support. Money-moving server actions gain explicit ADMIN-only guards.

## 1. Roles

- AdminUser.role already exists (default "ADMIN"). Meaningful values: "ADMIN" (full access; treat legacy/unknown/missing as ADMIN so existing sessions and Bar are never locked out) and "SUPPORT".
- next-auth: authorize() returns role; jwt/session callbacks carry it (augment types as the codebase does for id). Existing tokens without role = ADMIN.
- Team page: createTeamMember/updateTeamMemberRole already exist; ensure the UI offers ADMIN and SUPPORT choices (verify; adjust options if needed).

## 2. Access control

- Middleware:
  - New protected prefix "/support": requires a token (any role).
  - All ADMIN_PROTECTED paths: additionally, when token.role === "SUPPORT", redirect to /support.
  - When a SUPPORT user hits /admin/login while authenticated, ordinary flow applies (login page handles its own redirect; not in scope).
- Server-action hardening (belt and braces): a shared helper `requireAdminRole()` in src/lib/auth-helpers.ts (getServerSession; throw/return error unless role is missing or "ADMIN"). Apply to the money actions in src/actions/payments.ts: chargePaymentNow, retryPayment, chargePartialPayment, plus waiveLateFee. Everything else stays session-gated as today (accepted v1 scope).

## 3. /support workspace (src/app/support/*)

- Own layout (slim header: "PennyLime Support", agent name, tabs Chats / Emails / Tickets, Sign out button using next-auth signOut). No AdminTopNav. Route group NOT under /admin.
- Landing = Chats tab.
- **Chats tab**: mounts the existing ChatsClient component (imported from src/app/admin/chats/chats-client.tsx) unchanged. Its "Open contact" links point at /admin/contacts/... which SUPPORT users cannot open; acceptable v1 (link renders, middleware bounces) - optional polish: hide the link for support users is NOT required.
- **Emails tab**: two-pane inbox for InboundEmail (reuse getInbox/getInboxMessage/setInboxStatus from src/actions/inbox.ts). Filters: Unread / All / Replied / Archived. Detail view shows the email (same rendering approach as the admin inbox) plus a reply composer:
  - New action `replyToInboundEmail(emailId, body)` in src/actions/inbox.ts: session-gated (any role); loads the InboundEmail; sends via the existing Resend sendEmail helper to fromEmail with subject `Re: <original subject>` (avoid double Re:), a simple branded body (paragraphized text, escaped); sets status REPLIED; when contactId exists, logs an Activity {type: "email", title: "Support reply", details: body}. Returns {ok, error?}.
  - Composer: textarea, Send reply button (busy state, inline error), on success show "Replied" chip and refresh.
- **Tickets tab**: list of SupportTickets with filters (Open / Mine / Unassigned / All / Closed). Row: created, contact (name link omitted for support), reason, status chip, assignedTo. Actions per ticket: Assign to me / Unassign, Open <-> Closed toggle, View transcript (inline expand; transcript text is stored on the ticket). New session-gated actions in src/actions/tickets.ts: listSupportTickets(filter), setTicketStatus(id, "open" | "closed"), assignTicket(id, emailOrNull assigns to caller/unassigns).
- **Counters row** above tabs: chats needing reply (reuse pendingChats logic via getInboxBadges), unread emails, open tickets. Poll every 30s.

## 4. Admin side

- Admins can open /support too (e.g. to supervise); nothing else changes for them. No new admin nav item required (optional: none in v1).

## Error handling

- Role checks fail closed for the money actions; middleware redirect loop guarded (support redirect target /support is not in ADMIN_PROTECTED).
- Reply failures show inline; status not flipped to REPLIED unless the send succeeded.

## Testing

- Unit: requireAdminRole behavior (role ADMIN passes, missing role passes, SUPPORT rejected) if cheaply testable; otherwise verified by tsc + manual.
- Manual: create a SUPPORT user on the Team page; log in as them (incognito): lands on /support, /admin/contacts bounces to /support; chats work; reply to a real email (delivery + REPLIED chip); ticket assign/close. As ADMIN: everything unchanged; charge actions still work; as SUPPORT the charge actions are rejected.

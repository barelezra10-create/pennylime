# Chat Single View + Read/Triage Flow - Design Spec

Date: 2026-07-05
Status: Approved by Bar (conversation)

## Summary

Make /admin/chats the single chat surface (AI Support tab folds into CRM sub-items), add per-conversation admin read tracking (bold + blue dot for unread), and a Done / Keep working triage in the thread header. Done = RESOLVED (stored forever under the Resolved filter). Keep working = mark read, stays Open.

## 1. Nav consolidation

- Remove the "AI Support" top tab from src/components/admin/top-nav.tsx.
- CRM group gains, after Chats: { href: "/admin/tickets", label: "Tickets" }, { href: "/admin/agent/metrics", label: "AI metrics" }, { href: "/admin/agent/sessions", label: "Sessions (advanced)" }. CRM prefixes gain "/admin/agent" and "/admin/tickets".
- No page deletions; /admin/agent/* stays functional.

## 2. Read tracking

- New nullable field on AgentSession: `adminLastReadAt DateTime?` (hand-written additive migration, migrate deploy pattern; prod drift rule applies).
- `markChatRead(sessionId)` server action (session-gated): sets adminLastReadAt = now.
- `listChatConversations` returns `unread: boolean` = lastMessage exists AND (adminLastReadAt null OR lastMessage.at > adminLastReadAt). Admin's own replies do not create unread state because sendChatAdminReply ALSO sets adminLastReadAt = now (add that).
- UI: unread rows render the subject extra-bold with a blue dot before it; opening a thread calls markChatRead immediately, and the thread's 3s poll calls markChatRead again whenever new items arrive while the thread is open (keep it cheap: only when fresh.length > 0).

## 3. Triage

- Thread header replaces the single Resolve button with two when handlingStatus !== RESOLVED:
  - **Done** (green, primary): setChatHandlingStatus(id, "RESOLVED") + refresh. Resolved conversations remain stored and reachable under the Resolved filter (already true; nothing is deleted) and can be reopened.
  - **Keep working** (outline): calls markChatRead and refreshes the list (row un-bolds); no status change.
- Resolved threads keep the existing Reopen button.
- Existing actionBusy/error handling extends to the new buttons.

## Testing

- Unit: none new beyond compile (logic is thin over tested pieces); manual: unread bolding appears on a new visitor message, clears on open, Done moves to Resolved filter, Keep working un-bolds without resolving, AI Support tab gone but /admin/agent/sessions reachable from CRM.

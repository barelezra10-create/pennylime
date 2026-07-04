# Chat Redesign (Visitor Widget + Admin Chats Inbox) - Design Spec

Date: 2026-07-05
Status: Approved by Bar (conversation)

## Summary

Two-surface redesign: (1) a new messenger-style admin page at /admin/chats for reading and answering visitor chats, replacing the agent-sessions ops table as the answering surface; (2) a rebuilt visitor ChatWidget (responsive, readable, live-feeling) on the same API. The AI agent pipeline, escalation logic, and the email inbox are unchanged.

Out of scope: websockets/SSE (fast polling instead), in-app email replies, changes to runTurn/tools/tickets, SMS channel UI.

## Existing architecture this builds on (verified)

- Models: AgentSession (channel/mode/authLevel/lead fields/lastPolledAt/archivedAt/handlingStatus), AgentMessage (role, senderEmail set = human admin, emailedAt = offline email fallback, text), SupportTicket.
- API: POST /api/agent/chat handles session-create + user message + poll (sinceMessageId, bumps lastPolledAt).
- Admin reply: sendChatAdminReply in src/actions/agent-chat.ts (stores message, flips mode to human, emails the visitor when offline >30s); takeover/handback actions exist in the same file.
- Badge: pendingChats in src/actions/inbox-badges.ts (chat sessions where customer spoke last).
- Online = lastPolledAt within 30s.

## 1. Admin: /admin/chats

New route src/app/admin/chats/ (page.tsx + chats-client.tsx + thread components). Added to middleware ADMIN_PROTECTED and to the CRM nav group ("Chats" sub-item; keep the existing Inbox item for emails). The agent sessions table at /admin/agent/sessions stays untouched as the ops view.

### Data (new server actions in src/actions/agent-chat.ts)

- `listChatConversations(filter: "needs-reply" | "open" | "all" | "archived")`: chat-channel AgentSessions with: id, visitor display name (lead name else "Anonymous"), contactId?, mode, handlingStatus, archivedAt, startedAt, online (lastPolledAt within 30s), needsReply (latest message role === "user"), lastMessage {text preview 120 chars, at, role}, unansweredCount. Sorted: needsReply first (oldest-waiting first within that group), then by last message desc. Cap 100.
- `getChatConversation(sessionId, sinceMessageId?)`: session header data + messages (id, role, senderEmail, emailedAt, text, createdAt) + collapsed tool-call summaries (id, toolName, status, createdAt) merged in chronological order. With sinceMessageId only newer items (for polling).
- `archiveChatSession(sessionId)` / `unarchiveChatSession(sessionId)`: set/clear archivedAt.
- All session-gated (getServerSession pattern already used in that file).

### UI

Two-pane layout (list 360px, thread flex-1; stacked on small screens with back navigation):

- Left list: filter pills (Needs reply / Open / All / Archived). Row: name, green online dot, red "needs reply" badge with waiting time ("3m"), AI/Human chip, last-message preview (one line, truncated), time ago. Selected row highlighted. Polls listChatConversations every 10s.
- Right thread: header (name, online dot, mode chip, Open contact link when contactId, Archive button, "Hand back to AI"/"AI paused, you are live" state).
  - Messages: visitor left in gray bubbles; AI replies left in white bubbles with a small "AI" chip; admin replies right in green; 14px text; date separators; timestamps under bubbles (HH:MM); "sent by email" note where emailedAt is set.
  - Tool calls collapsed to a single muted line ("AI ran getLoanSummary") expandable on click for args/status.
  - Composer pinned bottom: auto-growing textarea, Enter sends / Shift+Enter newline, disabled with note when session archived. Sending calls sendChatAdminReply; if session mode was "ai", the UI shows the auto-takeover chip afterward (the action already flips mode).
  - Open thread polls getChatConversation(sinceMessageId) every 3s and appends; auto-scrolls only when the user is already at the bottom.
- Empty states for each filter.

### Notifications and badge fixes

- top-nav badge poll: extend the existing desktop-notification effect to also notify on new incoming CHAT messages (fire when pendingChats count rises above the previously seen count, with the newest visitor name when available; reuse the existing Notification permission flow).
- Fix pendingChats to exclude archived sessions (add archivedAt: null), matching the schema comment.

## 2. Visitor ChatWidget rebuild

Rewrite src/components/chat/ChatWidget.tsx in Tailwind (ChatWidgetGate unchanged). Same API contract; one additive change allowed: the poll request may be sent while the panel is closed (lightweight, every 20s when closed with an existing session; note this also keeps lastPolledAt honest only while open - closed polls must NOT bump presence, so closed polling passes a new flag `passive: true` which /api/agent/chat's poll branch uses to skip the lastPolledAt bump).

- Launcher: round-cornered green bubble (brand #15803d family) with a chat icon + "Chat with us" on desktop, icon-only on mobile; red unread-count badge when closed and new non-user messages arrived since last open (tracked via localStorage lastSeenMessageId).
- Panel: desktop 380x560 rounded-2xl shadow; mobile (max-width 640px) full-screen sheet (inset-0) with a top bar and close button.
- Header: brand green, "PennyLime Support", subtitle "AI assistant" or "Live agent" per mode, close button.
- Thread: message grouping (consecutive same-sender bubbles tighten), subtle timestamps every group (HH:MM), date separator when day changes, admin replies labeled "PennyLime team", animated three-dot typing indicator while awaiting the AI reply, auto-scroll when at bottom.
- History: on open with an existing session, full poll rehydrates history (existing behavior) - keep, plus render a loading shimmer meanwhile.
- Composer: auto-growing textarea (max 5 rows), Enter sends / Shift+Enter newline, send button with disabled state only when text empty; typing remains enabled while the AI is responding (queue the next send until the current request resolves).
- Human mode: after send, immediately render a subtle "Delivered - the team replies here" status under the message (first human-mode send only).
- Dedupe fix: give optimistic user messages a client id (crypto.randomUUID) and reconcile with server rows by (role + text + approximate time) OR change the send flow to use the id returned by the API response if available; at minimum the poll handler must not re-append a user message that matches the last optimistic one.
- Colors unified with brand green #15803d (launcher, header, user bubbles).

## 3. API tweak (only one)

/api/agent/chat poll branch: accept optional `passive: true` to skip the lastPolledAt bump (used by closed-widget polling so presence stays accurate). Everything else unchanged.

## Error handling

- Widget send failure: message marked "Failed - tap to retry", tap resends.
- Admin composer failure: inline error, text preserved.
- Poll failures: silent retry with backoff (widget) / silent skip (admin, next tick).
- Archived session opened by admin: thread read-only with an Unarchive button.

## Testing

- Unit (vitest): conversation sorting (needs-reply first, oldest-waiting first) extracted as a pure helper `sortConversations`; widget message-dedupe/merge logic extracted pure (`mergeMessages(existing, incoming)`); date-separator/grouping helper if extracted.
- Manual: full visitor flow (AI chat, handoff, admin reply while open and while closed, unread badge, mobile viewport), admin flow (filters, live poll during a takeover, archive, hand back to AI, desktop notification).

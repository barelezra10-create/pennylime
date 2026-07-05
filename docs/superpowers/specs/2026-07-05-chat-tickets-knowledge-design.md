# Chat Ticket Flow + AI Knowledge Loop - Design Spec

Date: 2026-07-05
Status: Approved by Bar (conversation)

## Summary

Two additions on top of the just-built /admin/chats inbox: (A) ticket-style workflow (auto subject, Open / Waiting on client / Resolved statuses with a Resolve button and auto-reopen); (B) an AI learning loop: when the AI cannot answer, it files the question into a Knowledge queue (deduped, with all waiting chats attached); the admin answers once; the AI sends that answer into every waiting chat and permanently knows it for future conversations.

## A. Ticket flow (uses the existing AgentSession.handlingStatus: OPEN | WAITING_CLIENT | RESOLVED)

- Subject: the first user message of the session, truncated to 80 chars, exposed by listChatConversations and getChatConversation and rendered bold as the list row title (name becomes the secondary line).
- Status transitions:
  - Visitor sends a message (API route user-message branch): handlingStatus becomes OPEN (auto-reopen of WAITING_CLIENT and RESOLVED).
  - Admin reply (sendChatAdminReply): handlingStatus becomes WAITING_CLIENT.
  - Resolve button (new action setChatHandlingStatus(sessionId, "RESOLVED")) in the thread header; also allow re-opening manually via the same action.
- List: filters become Needs reply / Open / Resolved / All / Archived (default Needs reply; "Open" = handlingStatus != RESOLVED and not archived; "Resolved" = RESOLVED and not archived). Status chip on each row (red Open when needsReply, amber Waiting on client, green Resolved). Thread header shows the chip + Resolve/Reopen button.

## B. Knowledge loop

### Data (new Prisma models, additive migration; prod DB has drift so use the hand-written-migration + migrate deploy pattern)

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
  id        String   @id @default(uuid())
  entryId   String
  entry     KnowledgeEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  sessionId String
  notifiedAt DateTime?
  createdAt DateTime @default(now())
  @@unique([entryId, sessionId])
  @@index([sessionId])
}
```

### AI side (src/lib/ai-agent)

- New tool `askOwner({ question })`, available at every auth level. Implementation (`recordOwnerQuestion(sessionId, question)` in src/lib/knowledge.ts): normalize the question (lowercase, strip punctuation/whitespace); if a PENDING entry's normalized question matches (exact normalized match OR one contains the other), attach this session as a waiter (upsert on the unique pair); else create a new PENDING entry + waiter. Returns a short instruction string for the model: tell the user the team has been asked and the answer will appear right here in the chat.
- System prompt injection in runTurn: fetch ANSWERED entries (cap 50, newest answered first), append a "Known answers from the PennyLime team" section of Q/A pairs, plus the instruction: if the user's question is not covered by your tools or these known answers, call askOwner instead of guessing.
- Follow the existing tool registration pattern in src/lib/ai-agent/tools/ exactly (declaration, executor, auth gating, redaction) - read two existing tools first.

### Admin side

- The /admin/chats page gets a top-level segmented switch: Conversations | Knowledge (client-side tab, no new route).
- Knowledge tab: two sections.
  - Pending questions (sorted by waiter count desc, then oldest first): question text, "N clients waiting" badge, answer textarea, Save & send button, Dismiss button (sets DISABLED).
  - Answered (searchable simple list): question, answer (inline editable, Save), sent count, Disable/Enable toggle.
- `answerKnowledgeEntry(entryId, answer)` action: sets ANSWERED/answer/answeredBy(session email)/answeredAt; then for every waiter without notifiedAt whose session is not archived: create an AgentMessage {role: "assistant", senderEmail: null, text: answer} in that session (the visitor sees it as the assistant, via the widget's normal poll), set the session handlingStatus to WAITING_CLIENT, mark the waiter notifiedAt, increment timesSent per send; if the waiter's session is offline (lastPolledAt stale) and has an email (contact or lead), send the same email fallback used by sendChatAdminReply (subject "You have a reply from PennyLime") and stamp the message emailedAt. Returns counts {sent, emailed}.
- `updateKnowledgeAnswer(entryId, answer)` (edit without re-sending), `setKnowledgeStatus(entryId, "DISABLED" | "ANSWERED")`, `listKnowledge(status)` - all session-gated.

## Error handling

- askOwner on a DB failure returns a string telling the model to apologize and suggest email; never throws into the agent loop.
- answerKnowledgeEntry is idempotent per waiter (notifiedAt guard) so re-clicking Save & send cannot double-message a session.
- Knowledge injection failure in runTurn degrades to no knowledge section (try/catch, never blocks the turn).

## Testing

- Unit (vitest): question normalization + pending-match logic (pure, in src/lib/knowledge.ts); subject truncation helper if extracted.
- Manual: AI files a question (force by asking something obscure), second session asking the same thing attaches to the same entry, answer once → both chats receive it, future session asking the same gets answered directly from knowledge; resolve/reopen flow; statuses.

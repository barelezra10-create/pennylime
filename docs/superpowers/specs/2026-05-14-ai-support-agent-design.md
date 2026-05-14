# PennyLime AI Support Agent — Design Spec

**Date:** 2026-05-14
**Owner:** Bar Elezra
**Scope:** Single shared AI agent powering three customer-facing surfaces — website chat widget, inbound SMS replies, and an inbound voice line — for PennyLime (Next.js cash-advance product for gig workers).

## 1. Goals

1. Replace human-only support with an AI-first model that handles FAQs, in-flight application help, authenticated account lookups, and a small set of write actions.
2. Use one shared agent "brain" (system prompt + tool catalog) across all three channels so prompt fixes, new tools, and audit logging land everywhere at once.
3. Stay inside the existing stack — Twilio + Gemini + Railway + Prisma/Postgres — with no new hosted vendors.
4. Be safe by default: PII never reaches the LLM, every write action requires explicit user confirmation, and every turn is logged.

## 2. Non-goals

- Live human transfer on voice (deliberately out of scope — voice is AI-only with email/SMS follow-up offered when AI cannot help).
- Outbound calls or proactive SMS by the agent.
- Multi-language support (English only at launch).
- Replacing the existing TCPA-compliance SMS keyword handler (STOP/START/HELP stays first in the inbound pipeline).
- Sentry/external APM (operate on Railway stdout + a new `AgentError` model).

## 3. Surfaces

| Surface | Entry point | Reply path |
|---|---|---|
| Website chat | Bubble component on public + dashboard pages; opens `EventSource` to `/api/agent/chat` | SSE token stream |
| Inbound SMS | Extends existing `/api/twilio/inbound`; runs only when message is not STOP/START/HELP and contact is opted in | TwiML `<Message>` (split at sentence boundaries ≤320 chars) |
| Inbound voice | `/api/twilio/voice` returns TwiML `<Connect><ConversationRelay>` pointing at a WebSocket on a separate Railway service (`pennylime-voice`) | ConversationRelay `text` events drive built-in TTS |

The chat widget is hidden on `/apply` step screens to avoid covering form controls. SMS keeps the existing STOP/START/HELP branch first; the agent branch only runs when the message is neither a keyword nor from an opted-out contact.

## 4. Architecture

### 4.1 Module layout

```
src/lib/ai-agent/
  systemPrompt.ts        # channel-parameterized prompt + brand/safety rules
  runTurn.ts             # single entry point used by all surfaces
  audit.ts               # writes AgentSession/Message/ToolCall rows
  redact.ts              # strips SSN-like patterns before persistence
  tools/
    index.ts             # tool registry + Gemini function-call schemas
    getLoanProducts.ts
    getStateRules.ts
    getApplicationStatus.ts
    getLoanSummary.ts
    getPaymentHistory.ts
    schedulePayment.ts
    changeDueDate.ts
    sendMagicLink.ts
    verifyIdentity.ts
    escalateToTicket.ts
src/app/api/agent/chat/route.ts           # SSE for chat widget
src/app/api/twilio/voice/route.ts         # TwiML entrypoint for inbound calls
src/app/api/twilio/inbound/route.ts       # extended — adds the agent branch
src/components/chat/ChatWidget.tsx        # bubble + transcript UI
```

A separate Railway service `pennylime-voice` runs a Node WSS server that imports `src/lib/ai-agent` and bridges Twilio ConversationRelay events ↔ `runTurn()`. Source lives in `voice/` at the repo root with its own `package.json` referencing the shared agent code via a workspace path or a small copied build step (decision deferred to the implementation plan — both options are viable on Railway).

### 4.2 `runTurn()` signature

```ts
type AuthLevel = "anon" | "phone-matched" | "verified";

type Ctx = {
  channel: "chat" | "sms" | "voice";
  contactId?: string;
  sessionId: string;           // stable per chat tab, call SID, or phone+thread
  authLevel: AuthLevel;
  metadata: {
    callSid?: string;
    from?: string;
    userAgent?: string;
    ip?: string;
  };
};

type ToolCall = {
  name: string;
  args: unknown;
  result: unknown;
  status: "ok" | "denied_auth" | "denied_confirm" | "error" | "rate_limited";
};

runTurn(userText: string, ctx: Ctx): Promise<{
  reply: string;
  toolCalls: ToolCall[];
  newAuthLevel?: AuthLevel;
}>
```

`runTurn` is responsible for:
1. Loading conversation history for `sessionId`.
2. Building the Gemini prompt = system prompt + history + new user turn + context block (auth level, contact summary if any, active loan summary if any).
3. Calling Gemini with the tool catalog filtered by `authLevel`.
4. Running any tool calls server-side, enforcing the auth gate and the confirmation gate before invoking write tools.
5. Looping until Gemini returns a final text answer.
6. Writing redacted user text + full assistant text to `AgentMessage`, tool invocations to `AgentToolCall`.
7. Updating `AgentSession.metadata.costCents` and returning the reply.

### 4.3 Surface adapters

**Chat (`/api/agent/chat`).** Client opens an SSE connection with a stable `sessionId` (persisted in `localStorage`) and posts user turns to the same route. On post, the server calls `runTurn` and streams the reply as token chunks. If a NextAuth session exists, `authLevel = "verified"` and `contactId` is populated from the session; otherwise `authLevel = "anon"` and the agent can request verification mid-conversation.

**SMS (`/api/twilio/inbound`, extended).** Existing keyword branch unchanged. New branch (after the existing logic): if `contact` exists and `smsOptIn !== false`, call `runTurn(body, { channel: "sms", contactId: contact.id, sessionId: \`sms:\${contact.id}\`, authLevel: "phone-matched", metadata: { from } })`. Reply is split into ≤320-char chunks at sentence boundaries and returned in one TwiML response (Twilio sends each `<Message>` as a separate SMS). Anonymous numbers (no matching contact) get a single fallback message pointing to email/the phone line.

**Voice (`/api/twilio/voice` + `pennylime-voice` service).** Inbound call hits `/api/twilio/voice`; we return:

```xml
<Response>
  <Connect>
    <ConversationRelay url="wss://voice.pennylime.com/relay"
                       welcomeGreeting="Hi, this is PennyLime support. This call may be recorded and processed by an AI assistant for service quality. How can I help?"
                       voice="en-US-Journey-F" />
  </Connect>
</Response>
```

The `pennylime-voice` service handles the WSS:
- `setup` event → phone lookup, set `authLevel = "phone-matched"` if matched, `"anon"` otherwise.
- `prompt` event (user finished speaking) → call `runTurn`, stream the reply back as ConversationRelay `text` events (built-in TTS reads them aloud).
- `interrupt` event → abort the current Gemini stream.
- `dtmf` event → used during last-4-SSN verification.
- `hangup` / WSS close → flush `AgentMessage`, set `AgentSession.endedAt` and `endReason = "hangup"`.

## 5. Capabilities and tool catalog

| Tool | Auth required | Behavior |
|---|---|---|
| `getLoanProducts` | none | Public product info — amounts, terms, states served |
| `getStateRules(state)` | none | APR cap + disclosure text from existing disclosures page |
| `getApplicationStatus(applicationId)` | session OR phone-matched | Returns stage + next step |
| `getLoanSummary(contactId)` | verified | Balance, next payment, APR, payoff amount |
| `getPaymentHistory(contactId, limit)` | verified | Last N payments |
| `schedulePayment(contactId, amount, date, confirm?)` | verified + confirm | Inserts a scheduled ACH debit |
| `changeDueDate(loanId, newDate, confirm?)` | verified + confirm | Updates payment schedule |
| `sendMagicLink(contactId, channel)` | none | Sends sign-in link as a deflection path |
| `verifyIdentity(contactId, factor)` | none | Compares last-4 SSN or DOB against `Contact`; upgrades session to `verified` on success |
| `escalateToTicket(reason, transcript)` | none | Creates a `SupportTicket` row for human follow-up |

Tool registry exposes a Gemini function-call schema per tool. `runTurn` filters the registry by `authLevel` before each Gemini call, so the model literally cannot see tools it is not allowed to invoke at the current level.

## 6. Auth and verification

Three levels:

| Level | How reached | What it unlocks |
|---|---|---|
| `anon` | Web chat with no session, SMS/voice with no matching contact | FAQs, products, state rules, application-by-ID lookup, magic-link send, escalation |
| `phone-matched` | SMS/voice from a phone matching a `Contact` row | Above + application status for that contact, balance-existence teaser |
| `verified` | NextAuth session OR `phone-matched` + last-4-SSN-or-DOB match in same session | Full read + write actions |

Verification flow (SMS/voice):
1. Agent prompts for the last 4 of SSN (or DOB as fallback).
2. User responds (text or DTMF on voice).
3. `verifyIdentity` does a constant-time compare against `Contact.ssnLast4`.
4. Three wrong attempts within 24h on the same `contactId+channel` (`AgentVerification` row) → tool returns `locked`; session capped at `phone-matched` and an `escalateToTicket` is auto-fired.
5. On success → `authLevel` upgraded to `verified` for the rest of the session; upgrade logged as a system message.

PII handling:
- SSN / DOB never enter the Gemini prompt. The model sees only the verification result (`verified: true|false`).
- `redact.ts` scrubs 9-digit and bare 4-digit-following-"ssn"/"social" patterns from user text before it is written to `AgentMessage`.
- Voice transcripts retained for 90 days, then reduced to a session summary (matches the existing data-retention policy).

## 7. Action gate (write tools)

Every write tool follows the same confirm-then-execute pattern, enforced inside `runTurn` independently of what the model says:

1. Model calls e.g. `schedulePayment({ amount: 120, date: "2026-05-20" })` with no `confirm` flag.
2. `runTurn` returns `{ needsConfirmation: true, summary: "Schedule a $120 payment on May 20, 2026 from your linked account ending …4321", token: <hash> }` and stores the token in `AgentSession.metadata.pendingConfirmation`.
3. Model speaks the summary verbatim, waits for "yes/confirm".
4. User confirms → model calls `schedulePayment({ ..., confirm: true })` → `runTurn` checks that the pending token's hashed payload matches and was issued ≤90 seconds ago → executes.
5. Single-use: token cleared on success or rejection.

This makes it impossible for the model to silently fire a write — the second call is gated on a server-side state the model cannot fabricate.

## 8. Brand and channel guardrails (system prompt)

- Identity: PennyLime support for $100–$10K cash advances aimed at gig workers (Uber, Lyft, DoorDash, Instacart, Grubhub, Amazon Flex).
- Never invent rates, fees, or APRs; quote from the disclosures content only.
- Never give legal, tax, or generic financial advice.
- Hard rule: no em dashes anywhere in agent output (matches Bar's standing brand rule).
- Voice channel: short sentences, no markdown, no URLs spoken aloud — offer to text or email instead.
- SMS channel: ≤320 characters per message; no emojis; no markdown.
- Chat channel: full markdown allowed; links allowed.
- Unsupported state: refuse and refer politely (don't quote a number we can't legally offer).

## 9. Data model

Five new Prisma models (all additive — no changes to existing tables besides one optional column and back-references):

```prisma
model AgentSession {
  id           String   @id @default(cuid())
  channel      String   // "chat" | "sms" | "voice"
  contactId    String?
  contact      Contact? @relation(fields: [contactId], references: [id])
  authLevel    String
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  endReason    String?  // "hangup" | "idle" | "escalated" | "rate_limit" | "cost_cap"
  metadata     Json?    // callSid, from, userAgent, ip, costCents, pendingConfirmation
  messages     AgentMessage[]
  toolCalls    AgentToolCall[]
  @@index([contactId])
  @@index([channel, startedAt])
}

model AgentMessage {
  id          String   @id @default(cuid())
  sessionId   String
  session     AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role        String   // "user" | "assistant" | "system" | "tool"
  text        String
  tokensIn    Int?
  tokensOut  Int?
  createdAt   DateTime @default(now())
  @@index([sessionId, createdAt])
}

model AgentToolCall {
  id            String   @id @default(cuid())
  sessionId     String
  session       AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  name          String
  argsRedacted  Json
  resultStatus  String   // "ok" | "denied_auth" | "denied_confirm" | "error" | "rate_limited"
  resultSummary String?
  errorMessage  String?
  durationMs    Int
  createdAt     DateTime @default(now())
  @@index([sessionId, createdAt])
  @@index([name, resultStatus, createdAt])
}

model AgentVerification {
  id           String   @id @default(cuid())
  contactId    String
  contact      Contact  @relation(fields: [contactId], references: [id])
  channel      String
  attempts     Int      @default(0)
  lockedUntil  DateTime?
  lastTriedAt  DateTime @default(now())
  @@unique([contactId, channel])
}

model SupportTicket {
  id              String   @id @default(cuid())
  sessionId       String?
  contactId       String?
  reason          String
  transcript      String   // last ~20 turns
  status          String   @default("open")
  assignedTo      String?
  createdAt       DateTime @default(now())
  resolvedAt      DateTime?
  @@index([status, createdAt])
}

model AgentError {
  id          String   @id @default(cuid())
  sessionId   String?
  toolName    String?
  message     String
  stack       String?
  createdAt   DateTime @default(now())
  @@index([createdAt])
}
```

Existing-table touches:
- `Contact`: confirm whether `ssnLast4` exists; if not, add it. If full SSN is already stored encrypted, add a getter that derives the last 4 (decision deferred to the plan after reading current schema).
- `Contact`: add back-references `agentSessions AgentSession[]` and `verifications AgentVerification[]`.

Migration shipped via the existing `prisma migrate deploy` step in the Railway start chain.

## 10. Admin surfaces

- `/admin/agent/sessions` — paginated table with filters (channel, contact, auth level, status). Drill-down shows the full transcript with tool calls inline.
- `/admin/agent/metrics` — sessions/day/channel, average tokens, average cost, tool-call success rate, verification-failure rate, escalation rate.
- `/admin/tickets` — SupportTicket queue with assign/close.

Reuses the existing `/admin` layout, auth (SUPER_ADMIN role), and table primitives.

## 11. Observability and cost controls

- Each `AgentSession.metadata.costCents` is updated per turn (Gemini token cost + Twilio leg cost).
- One structured JSON log per turn to stdout (Railway): `{ sessionId, channel, toolName?, latencyMs, tokensIn, tokensOut, costCents }`.
- Tool exceptions captured to `AgentError` with a 7-day retention trim (nightly cron in the existing cron infra).
- Per-session limits: 60 user turns / 10 min (chat), 30 / 10 min (SMS), 15-min wall clock (voice).
- Per-IP anon-chat: 20 sessions / day.
- Per-session cost caps: $0.50 soft (warn in logs), $2.00 hard (auto-escalate to ticket and end session with `endReason = "cost_cap"`).
- Daily global budget via env var `AGENT_DAILY_BUDGET_USD`. On hit, all surfaces return a static "we're at capacity, leave a message" reply and auto-ticket.

## 12. Compliance

- TCPA: SMS flow respects `smsOptIn`; the agent branch only runs when opted in. Opt-out keyword handling is unchanged.
- State licensing: agent quotes APR caps and disclosures only from `getStateRules`. Unsupported states get a referral message and an auto-ticket.
- Recording disclosure: voice greeting in the TwiML welcome explicitly states the call may be recorded and processed by an AI assistant.
- Data retention: voice transcripts truncated to summary at 90 days. SMS/chat transcripts follow the existing data-retention policy.
- The existing `Contact.smsOptIn`, `smsOptOutAt`, and `SmsMessage` audit trail remain authoritative for SMS compliance.

## 13. Testing strategy

- **Tool units:** each tool is a pure function of `(args, ctx) → result` with mocked Prisma. Direct unit tests assert auth gating, confirmation gating, error shape.
- **`runTurn` integration:** stub Gemini client; assert that the registry filters by `authLevel`, that write tools without `confirm: true` produce a confirmation summary, that PII redaction runs before persistence, and that `costCents` updates monotonically.
- **Conversation goldens:** seeded contact + scripted turns ("balance please", "schedule a payment for tomorrow", "what's my next due date"). Assert the tool sequence and that the final text contains the key facts (amount, date, last-4 of bank).
- **Voice fixture:** drive the WSS endpoint with synthetic `setup` / `prompt` / `interrupt` / `hangup` events; assert lifecycle (`AgentSession.endedAt` set, transcript flushed).
- **No real Twilio/Gemini calls in CI** — all mocked. One manual staging script `scripts/agent-e2e.ts` performs a real round trip on each channel.

## 14. Rollout phases

1. **Phase 1 — Chat behind flag.** Ship `src/lib/ai-agent/*`, the chat route, and the widget behind `?agent=1` on staging with seeded test data.
2. **Phase 2 — SMS allow-list.** Enable the SMS branch in `/api/twilio/inbound` for an allow-listed phone number (Bar's) on prod.
3. **Phase 3 — Voice service on staging.** Stand up `pennylime-voice` Railway service, point a test Twilio number at `/api/twilio/voice`, dial-test.
4. **Phase 4 — Full prod.** Remove the chat flag, drop the SMS allow-list, point the public Twilio Voice URL at `/api/twilio/voice`.

## 15. Open implementation decisions (resolved in the plan)

- How `pennylime-voice` shares the agent code with the main app on Railway (workspace, git submodule, or copy-at-build).
- Whether `Contact.ssnLast4` exists or needs adding, based on the current schema.
- Gemini model exact version (Flash for cost; final pin set in the plan).
- Voice/TTS voice ID choice — needs a brand-fit pass before launch.

## 16. Out of scope (explicit)

- Live human transfer or warm hand-off on voice.
- Outbound calls or proactive SMS by the agent.
- Multi-language.
- Sentiment-aware routing or any per-user model fine-tuning.
- Replacing the TCPA keyword handler.

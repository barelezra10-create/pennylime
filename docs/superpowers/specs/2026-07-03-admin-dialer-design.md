# Admin Dialer (Twilio Voice) - Design Spec

Date: 2026-07-03
Status: Approved by Bar (conversation), pending spec review

## Summary

Click-to-call softphone inside the PennyLime admin. Agents call clients through the browser microphone using the Twilio Voice JS SDK. Caller ID is the existing toll-free number (+1 888 691 2706, the same number wired for SMS). Outbound calls are recorded after a "this call may be recorded" announcement is played to the client. Inbound calls to the toll-free number go to voicemail, which is recorded, transcribed, matched to a contact, and surfaced in the admin.

Out of scope for this phase: power dialer queue / auto-advance, live inbound answering in the browser, call forwarding to a cell phone, multi-agent presence or routing.

## Decisions made

| Question | Decision |
|---|---|
| Dialer type | Click-to-call, one contact at a time |
| Audio path | In-browser mic via Twilio Voice JS SDK |
| Caller ID | Existing toll-free +18886912706 (reuses `twilioFromNumber`) |
| Recording | Yes, with an announcement played to the client before connect |
| Inbound calls | Voicemail with recording + transcription, shown in admin |

## Architecture

### Outbound call flow

1. Agent clicks Call on a contact. The browser fetches a short-lived Voice access token from `GET /api/voice/token` (admin session required), then the Voice SDK connects to Twilio with params `{ To: <clientPhone>, contactId }`.
2. Twilio invokes the TwiML App voice webhook `POST /api/voice/outbound`. The handler:
   - validates the Twilio signature,
   - creates a `CallLog` row (direction `outbound`, status `initiated`, keyed by `CallSid`),
   - returns `<Dial callerId="<twilioFromNumber>" record="record-from-answer-dual" recordingStatusCallback="/api/voice/recording" action="/api/voice/dial-complete"><Number url="/api/voice/whisper" statusCallback="/api/voice/status" statusCallbackEvent="ringing answered completed">clientNumber</Number></Dial>`.
3. `POST /api/voice/whisper` runs on the client leg when the client answers. It returns TwiML that plays: "This call is from PennyLime and may be recorded for quality purposes." Then the legs are bridged.
4. `POST /api/voice/status` (call status callback) and `/api/voice/dial-complete` update the `CallLog`: ringing, in-progress, completed, no-answer, busy, failed, plus `durationSec`.
5. `POST /api/voice/recording` attaches `recordingSid` and `recordingUrl` when Twilio finishes processing the recording.

### Inbound call flow (voicemail)

1. The toll-free number's Voice URL is set to `POST /api/voice/inbound`.
2. Handler validates signature, matches the caller to a contact via `normalizePhone` (same helper the SMS path uses), creates a `CallLog` (direction `inbound`, kind `voicemail`), and returns TwiML: a `<Say>` greeting ("You have reached PennyLime. Please leave your name, number, and a brief message.") followed by `<Record maxLength="180" transcribe="true" transcribeCallback="/api/voice/transcription" recordingStatusCallback="/api/voice/recording" playBeep="true">` with a hangup fallback.
3. Recording and transcription callbacks fill in `recordingSid`, `recordingUrl`, `transcription`.

### Recording playback

Recordings stay on Twilio. The admin plays them through `GET /api/admin/calls/[id]/recording`, a proxy route that authenticates to Twilio server-side with the account credentials and streams the audio. No public or client-side Twilio URLs.

### Security

- `/api/voice/token` requires an authenticated admin session. Tokens are scoped with a VoiceGrant for the TwiML App, TTL around 1 hour, identity set to the admin's email.
- All `/api/voice/*` webhook routes validate `X-Twilio-Signature` against the configured auth token and are idempotent on `CallSid`.
- `twilioApiKeySecret` is stored encrypted, the same as the existing Twilio auth token in `TrackingConfig`.

## Data model

New Prisma model, patterned after `SmsMessage`:

```prisma
model CallLog {
  id             String    @id @default(uuid())
  contactId      String?
  direction      String    // outbound | inbound
  kind           String    @default("call") // call | voicemail
  fromNumber     String
  toNumber       String
  twilioCallSid  String?   @unique
  status         String    @default("initiated") // initiated, ringing, in-progress, completed, no-answer, busy, failed, canceled
  durationSec    Int?
  recordingSid   String?
  recordingUrl   String?
  transcription  String?
  outcome        String?   // answered, no-answer, voicemail-left, busy, wrong-number, other
  notes          String?
  agentEmail     String?
  heardAt        DateTime? // voicemail listened-to marker
  startedAt      DateTime?
  endedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([contactId])
  @@index([createdAt])
  @@index([status])
}
```

`TrackingConfig` gains three fields, editable on the existing admin tracking settings page:

- `twilioTwimlAppSid`
- `twilioApiKeySid`
- `twilioApiKeySecret` (encrypted at rest, write-only in the UI like the auth token)

Caller ID reuses the existing `twilioFromNumber`.

## Server components

| Route | Purpose |
|---|---|
| `GET /api/voice/token` | Mint Voice access token (admin session gated) |
| `POST /api/voice/outbound` | TwiML App webhook: create CallLog, return Dial TwiML |
| `POST /api/voice/whisper` | Client-leg announcement before bridging |
| `POST /api/voice/dial-complete` | Dial action callback: final dial outcome |
| `POST /api/voice/status` | Call status lifecycle updates |
| `POST /api/voice/recording` | Recording ready callback |
| `POST /api/voice/inbound` | Toll-free inbound: greeting + voicemail Record |
| `POST /api/voice/transcription` | Voicemail transcription callback |
| `GET /api/admin/calls/[id]/recording` | Authenticated recording audio proxy |
| `PATCH /api/admin/calls/[id]` | Save outcome, notes, mark voicemail heard |
| `GET /api/admin/calls` | List calls/voicemails (filters: contact, direction, unheard) |

Shared server lib: `src/lib/voice/` with `twiml.ts` (TwiML builders, pure and unit-testable), `token.ts` (access token minting), `signature.ts` (webhook validation, reusable by SMS webhooks later).

Dependencies: `@twilio/voice-sdk` (client), `twilio` (server-side, used only for AccessToken/VoiceGrant and signature validation). Webhook handlers keep the codebase's existing raw-REST style for any Twilio API calls.

## Admin UI

- **DialerProvider + floating panel**: a React context mounted in `src/app/admin/layout.tsx`. The panel (bottom-right) shows contact name and number, call state, a running timer, mute and hang-up buttons. After hang-up it shows an outcome picker (answered, no-answer, voicemail-left, busy, wrong-number, other) and a notes box; saving PATCHes the CallLog. Panel persists across admin navigation during a call.
- **Call buttons**: contact detail header and pipeline kanban cards. Disabled with a tooltip when the contact has no valid phone or voice config is incomplete.
- **Contact detail "Calls" section**: per-contact call history with direction, outcome, duration, inline recording player, voicemail transcript.
- **`/admin/calls` page**: all calls and voicemails, newest first, unheard voicemails highlighted, filterable by direction and outcome. Added to the admin nav.
- **Unconfigured state**: if TwiML App SID or API key are missing, the panel and call buttons show "Voice not configured" linking to settings. Nothing else in the admin is affected.

## Error handling

- Mic permission denied or token fetch failure: visible error state in the panel, never silent.
- Client leg fails (invalid number, carrier reject): Dial action callback records `failed`/`no-answer`; the panel shows the result.
- Webhook retries: all handlers upsert by `CallSid`, safe to replay.
- Recording callback arriving after page close: recording still attaches to the CallLog; visible on next visit.
- The announcement is part of the dual-channel recording, which doubles as proof the notice was played.

## Testing

- Unit tests (existing `*.test.ts` vitest pattern): TwiML builders (outbound dial, whisper, inbound voicemail), inbound contact matching by normalized phone, signature validation.
- Manual acceptance: call own cell from the admin (hear announcement, verify recording + CallLog + outcome save), leave an inbound voicemail (verify transcription, contact match, unheard highlight, playback via proxy).

## Rollout / one-time Twilio setup

1. Create a Twilio API Key (SID + secret) and a TwiML App with Voice URL `https://pennylime.com/api/voice/outbound`.
2. Set the toll-free number's Voice URL to `https://pennylime.com/api/voice/inbound`.
3. Confirm the toll-free number is voice-enabled on the account.
4. Enter TwiML App SID, API Key SID, API Key secret in admin settings.
5. Deploy = push to main (Railway), including the Prisma migration for `CallLog` and the `TrackingConfig` fields.

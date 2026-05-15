# AI Support Agent — Rollout Runbook

Implementation is on `main` as of commit `4b3480c`. Code is shipped but the agent will not work until the steps below are completed.

## 1. Web service (existing `pennylime` Railway service)

Add three env vars in the Railway dashboard under `pennylime` → Variables:

| Name | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | (from `~/.claude/projects/-Users-baralezrah/memory/reference_gemini_api_new.md`) | Already used by social bot, may already be set |
| `AGENT_CONFIRM_SECRET` | `openssl rand -hex 32` output | Must match the voice service value exactly |
| `VOICE_RELAY_WSS_URL` | `wss://<voice-service-public-domain>/relay` | Filled in after step 2 |

After saving, Railway will redeploy the web service.

## 2. Voice service (new `pennylime-voice` Railway service)

Create a NEW service in the existing `PennyLime` Railway project:

1. Railway dashboard → PennyLime project → New → GitHub Repo → pick the same `pennylime` repo
2. Settings → Source → set Root Directory to `voice`
3. Settings → Build → Build command: `npm install`
4. Settings → Deploy → Start command: `npm start`
5. Variables — add four:
   - `GEMINI_API_KEY` (same as web)
   - `AGENT_CONFIRM_SECRET` (same value as web)
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference the same Postgres service)
   - (Optional) `PORT` defaults to 8080
6. Settings → Networking → Generate Domain. Copy the public domain (e.g. `pennylime-voice.up.railway.app`).
7. Go back to the `pennylime` web service variables and set `VOICE_RELAY_WSS_URL=wss://<that-domain>/relay`.

Smoke-test:
```bash
curl -s https://<voice-domain>/
# → "pennylime-voice ok"
```

## 3. Twilio configuration

In the Twilio Console → Phone Numbers → the PennyLime number:

| Webhook | URL | Method |
|---|---|---|
| Voice — A call comes in | `https://pennylime.com/api/twilio/voice` | POST |
| Messaging — A message comes in | `https://pennylime.com/api/twilio/inbound` | POST (unchanged — was already set for SMS) |

## 4. Verify in production

After step 3 saves, the agent is live across all three surfaces.

- **Chat:** open `https://pennylime.com`, click the green "Chat with us" bubble, ask "what amounts do you offer." Expect a reply mentioning $100 to $10,000.
- **SMS:** text the public Twilio number from a phone whose `Contact.smsOptIn !== false`. Send "What is my next payment" — expect a reply requesting DOB verification.
- **Voice:** call the public Twilio number. Expect to hear the welcome greeting and have a back-and-forth.

Check `/admin/agent/sessions` after each. Three new rows should appear (one per channel).

## Operational notes

- **Cost cap:** hardcoded at $2.00/session in `src/lib/ai-agent/runTurn.ts:13`. To raise/lower, edit and redeploy.
- **Per-session tool-call cap:** 5 tool calls per turn. Hardcoded at the same location.
- **Confirmation token TTL:** 90 seconds, hardcoded in `src/lib/ai-agent/confirmation.ts`.
- **Verification lockout:** 3 wrong DOB attempts → 24-hour lock per `(contactId, channel)`. Resets automatically once the lock expires.
- **PII redaction:** raw user text is run through `redactPII` before persistence to `AgentMessage`. Tool args are redacted by field (only `verifyIdentity.dob` is masked, payment amounts/dates are preserved for audit).

## Known follow-ups (not blocking launch)

- Single-use enforcement on confirmation tokens is not implemented (relies on 90s TTL + LLM unlikely to duplicate).
- `getApplicationStatus` allows lookup by any application code at phone-matched level (rate-limit + audit will protect).
- Session-cumulative cost is not capped — only per-turn. Multi-turn abuse remains possible if a session has 100 turns under the per-turn cap.
- Voice DTMF only flushes after 4 digits; a 1-2 digit entry just lingers in the buffer.
- Tests do not cover: cost cap branch, verifyIdentity-driven auth upgrade mid-loop, argsRedacted persistence contract.

## Local development

- `.env` needs `GEMINI_API_KEY` and `AGENT_CONFIRM_SECRET` set for the agent to function locally.
- Run the web app with `npm run dev` and the voice service with `cd voice && npm run dev` (port 8080).
- Tests work without any env vars (the Gemini client is mocked, the confirmation secret falls back to a process-local random).

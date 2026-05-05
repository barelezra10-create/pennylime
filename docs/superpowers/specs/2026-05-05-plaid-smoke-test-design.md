# Plaid Smoke-Test Admin Page — Design

**Date:** 2026-05-05
**Author:** Bar Elezra (with Claude)
**Status:** Approved, ready for implementation plan

## Goal

Verify that the existing Plaid integration in PennyLime works end-to-end against real Plaid sandbox credentials. The integration is already scaffolded but has never been exercised because `.env` ships with placeholder Plaid keys.

The output of this work is a single new admin page that runs the full Plaid pipeline (bank link → income & balance fetch → Increase external account creation) against a fixed seeded test application, with one click and clear pass/fail state for each step.

## Non-goals

- Productionizing Plaid (moving from sandbox to development/production environment).
- New Plaid features (e.g. recurring re-verification, balance pre-checks before disbursement).
- Webhook stale-link flow testing. Webhook endpoint exists; stale-flow exercise is a separate future task.
- Actual ACH disbursement testing (`createAchCredit`). Smoke test stops at `external_account` creation. Real disbursement is exercised via existing admin "Fund" button on real applications.
- Automated tests for the smoke-test page itself.

## Existing Plaid scaffolding (do not rebuild)

- `src/lib/plaid.ts` — Plaid client.
- `/api/plaid/create-link-token`, `/api/plaid/exchange-token`, `/api/plaid/webhook` — API routes.
- `src/actions/plaid.ts` — `fetchAndStoreIncome`, `getPlaidIncomeData`, `ensureIncreaseExternalAccount`.
- `Application` schema fields — `plaidAccessToken`, `plaidAccountId`, `plaidItemId`, `plaidLinkStale`, `monthlyIncome`, `bankBalance`, `increaseTransferId`, `increaseTransferStatus`, `increaseDisburseError`. (Note: there is no `increaseExternalAccountId` column today; `ensureIncreaseExternalAccount` returns the ID but does not persist it.)
- Apply flow `StepPlaidLink` component using `usePlaidLink`.

## Architecture

### Route

New admin-only page at `/admin/plaid-test`.

- Server-rendered page that hydrates a small client component for the buttons + result panel.
- Auth: same gate as `/admin/applications/[id]` (next-auth session check; redirect to `/admin/login` if missing). No new role layer.
- Sidebar nav entry under the existing admin nav for discoverability.

### Test application seed

The page operates on a single fixed seeded application identified by a hardcoded UUID (`plaid-test-app` style ID, exact value chosen at implementation time).

- Seed lives in (or extends) `prisma/seed-demo-data.ts`.
- Seeded with all fields required by `ensureIncreaseExternalAccount` (firstName, lastName, applicationCode, contact relation, etc.).
- `plaidAccessToken`, `plaidAccountId`, `plaidItemId`, `monthlyIncome`, `bankBalance` are all initialized to `null` so each Railway deploy starts clean.
- Because Railway DB is ephemeral on every deploy (per project memory), the seed runs fresh each push and the test app is always predictable.

### UI layout (top to bottom)

1. **Status panel** — live state of the test app.
   - `plaidItemId`, `plaidAccountId` (raw or `—`)
   - `plaidAccessToken` shown as `stored (encrypted)` or `—` (never display the actual token)
   - `monthlyIncome`, `bankBalance` (formatted currency or `—`)
   - `plaidLinkStale` boolean badge
   - `lastExternalAccountId` — client-side state from most recent `ensureIncreaseExternalAccount` call (not stored in DB; cleared on page reload or "Reset")

2. **Single button: "Run Plaid pipeline"** — opens Plaid Link, then chains the full pipeline automatically (see Data Flow below). Shows inline per-step progress indicators (✓ / ⏳ / ✗) so the user can see exactly where things are and where they failed.

3. **Button: "Reset test app"** — wipes all Plaid + Increase fields on the test app back to `null` so the pipeline can be re-run without redeploying.

4. **Last result debug panel** — collapsible, always-visible. Shows raw JSON from the most recent step (Plaid auth response, `transactionsGet` response, Increase create response, error payloads).

### Server actions

- `persistPlaidLinkToTestApp({ accessToken, itemId, accountId })` — new. Persists the encrypted Plaid tokens onto the seeded test application. The existing `/api/plaid/exchange-token` returns the encrypted token to the client but doesn't save it (the apply flow saves later on submission); the smoke-test page needs to save it directly.
- `fetchAndStoreIncome("plaid-test-app")` — existing, called as-is.
- `ensureIncreaseExternalAccount("plaid-test-app")` — existing, called as-is.
- `getPlaidDebugDump(applicationId)` — new, **smoke-test page only**. Calls Plaid `transactionsGet`, `authGet`, `identityGet` and returns the raw responses for the debug panel. Does not pollute the production action surface. ~30 lines.
- `resetTestApp()` — new. Wipes the test app's Plaid + Increase fields back to `null`.

## Data flow (when "Run Plaid pipeline" clicked)

```
1. Client → POST /api/plaid/create-link-token { applicationId: "plaid-test-app" }
            ← { linkToken }
2. Client opens Plaid Link UI → user enters user_good / pass_good
3. Client → POST /api/plaid/exchange-token { publicToken, accountId }
            ← { accessToken (encrypted), itemId, accountId }
4. Client → server action persistPlaidLinkToTestApp({ accessToken, itemId, accountId })
            → updates test app row → returns ok
5. Client → server action fetchAndStoreIncome("plaid-test-app")
            → Plaid transactionsGet (3mo) → sum deposits → /3
            → Plaid accountsBalanceGet → store bankBalance
            → returns { monthlyIncome }
6. Client → server action ensureIncreaseExternalAccount("plaid-test-app")
            → decrypt access token
            → Plaid authGet → routing + account number
            → Increase /external_accounts → returns external_account_id
            → store on test app → returns { externalAccountId }
7. Client → re-fetch test app row → refresh status panel + debug panel
```

## Error handling

**Plaid Link UI errors** (modal closed, sandbox creds rejected, etc.): `usePlaidLink`'s `onExit` callback receives the error. Display toast with Plaid error code + message. UI buttons remain enabled, no DB writes happened, user can retry.

**Server-side step failures:**
- Each step is independent. If step 5 fails after step 4 succeeded, leave the persisted Plaid token in place (still valid) and stop the chain.
- Inline progress indicator turns red (✗) on the failed step.
- Toast shows human summary ("Income fetch failed").
- Debug panel shows raw error JSON including `error_code` / `error_message` from Plaid or Increase.
- Errors logged server-side via `console.error` (existing behavior in actions).

**Recovery:**
- "Reset test app" wipes state for a clean retry.
- Re-clicking "Run Plaid pipeline" re-links a fresh token (steps 1-4 always run from scratch).

**Out of scope (YAGNI):**
- Retry/backoff logic.
- Partial-rollback on failure.
- Plaid transaction pagination (sandbox returns ~30 days in one page).

## Env vars & deploy

### Local `.env`
Replace the existing placeholders:
```
PLAID_CLIENT_ID=<sandbox client_id>
PLAID_SECRET=<sandbox secret>
PLAID_ENV=sandbox
PLAID_WEBHOOK_URL=https://pennylime.com/api/plaid/webhook
```

### Railway env (must be set on `pennylime` service before testing)
- `PLAID_CLIENT_ID` (same sandbox client_id)
- `PLAID_SECRET` (same sandbox secret)
- `PLAID_ENV=sandbox`
- `PLAID_WEBHOOK_URL=https://pennylime.com/api/plaid/webhook`

Bar handles the Railway env var setup.

### Plaid dashboard config (one-time)
- Add `https://pennylime.com/api/plaid/webhook` to allowed webhook URLs in the Plaid sandbox app settings.
- Confirm Auth, Identity, Transactions products are enabled (default yes).

### Increase env
Sandbox keys already present in `.env`. Verify they're also set on Railway (`INCREASE_API_KEY`, `INCREASE_ACCOUNT_ID`, `INCREASE_ENV`); add if missing.

### Deploy sequence
1. Bar sets Plaid env vars on Railway.
2. Implement code changes locally; commit.
3. `git push origin main` → Railway redeploys, reseeds test app fresh.
4. After deploy completes, navigate to `pennylime.com/admin/plaid-test`, run pipeline.

## Verification checklist

After deploy, manually verify:
1. Plaid Link UI opens, sandbox login `user_good` / `pass_good` accepted, modal closes clean. Status panel shows `plaidItemId`, `plaidAccountId`, encrypted token marker.
2. `monthlyIncome` populates with a non-null number. Debug panel shows raw `transactionsGet` with at least one deposit.
3. `bankBalance` populates with a non-null number.
4. `lastExternalAccountId` (client-side) shows an `external_account_xxx` ID. Debug panel shows `authGet` returned real routing/account numbers and the Increase create response returned an ID.
5. "Reset test app" wipes all fields back to `—`; pipeline can be re-run.
6. Browser console clean during the run. Railway logs show no unhandled exceptions.

## Open questions

None at design approval time.

## Implementation surface (rough estimate)

- New admin page: `src/app/admin/plaid-test/page.tsx` (server) + `src/app/admin/plaid-test/client.tsx` (client component with buttons / panels / `usePlaidLink`).
- New server actions in `src/actions/plaid-test.ts` (or appended to `src/actions/plaid.ts` with clear test-only naming): `persistPlaidLinkToTestApp`, `getPlaidDebugDump`, `resetTestApp`.
- Seed extension in `prisma/seed-demo-data.ts` (or new `scripts/seed-plaid-test-app.ts` chained into the build script).
- Sidebar nav entry in the existing admin layout.
- No schema changes (all fields already exist).
- No changes to existing `/api/plaid/*` routes or existing `src/actions/plaid.ts` exports.

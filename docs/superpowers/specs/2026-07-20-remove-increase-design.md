# Remove Increase, GoACH-Only (Staged) - Design Spec

Date: 2026-07-20
Status: Approved by Bar (conversation)

## Summary

Make GoACH the ONLY processor for new charges and disbursements. Remove Increase origination code, the processor switch, and the Increase test harness. Keep a minimal READ-ONLY Increase status sync for the ~7 in-flight Increase transfers until they settle (then delete in a follow-up). Add GoACH branches to the three money paths that are currently Increase-only. Add a production-config guard so the software can NEVER charge a real borrower against GoACH staging.

## Context (verified against prod, 2026-07-20)
- Switch is on "increase". GoACH env on Railway is STAGING-only (no prod key yet). 0 payments via GoACH.
- In flight on Increase: 2 repayment transfers + 5 disbursements (must keep syncing).
- Consequence, accepted by Bar: with Increase removed and GoACH still on staging, NEW charges pause until the GoACH production key is set. In-flight Increase transfers keep syncing to completion.

## Production guard (the core safety property)
A new accessor `goachProductionReady()` returns true only when GoACH is configured AND `GOACH_BASE_URL` points at the production host (contains "login.goach.com"). Every ORIGINATION path (debit, disburse, custom charge, payoff, skip, auto-fund) checks it and returns a clear error ("GoACH production not configured") instead of charging when it is false. This makes it impossible to originate real money against the staging (simulated) endpoint. Status-sync/read paths do NOT require it (they only read).

## What is removed
- **Origination code** in src/lib/increase.ts: createAchDebit, createAchCredit, createRtpTransfer, safeDebit, safeDisburse, createExternalAccount. KEEP the read functions getAchTransfer, getRtpTransfer (in-flight status), and whatever the status poll/webhook/refresh/audit-stale-returns use.
- **The processor switch**: getPaymentProcessor collapses to always "goach" (or is removed and callers hardcode goach); remove the paymentProcessor toggle from tracking settings UI + ALLOWED_FIELDS. The TrackingConfig.paymentProcessor column stays in the DB (harmless) but is no longer read for routing. goachEnv stays; add goachProductionReady.
- **Increase test harness**: src/actions/increase-test.ts, src/app/admin/increase-test/*, its nav link, its middleware entry.
- **ensureIncreaseExternalAccount** call sites in origination paths are replaced by ensureGoachBankAccount. The function itself + getPlaidAchNumbers stay (getPlaidAchNumbers is used by GoACH provisioning).

## What is kept (read-only, for the in-flight 7)
- src/lib/increase.ts read functions (getAchTransfer etc.).
- The Increase repayment + disbursement status polls in src/app/api/cron/payment-status/route.ts (already scoped to exclude goach rows via processor/goachDisburseUuid filters). These only READ Increase and update legacy rows.
- src/actions/refresh-payment-status.ts Increase branch, src/actions/sync-increase-status.ts, src/actions/audit-stale-returns.ts, src/app/api/increase/webhook/route.ts.
- Env INCREASE_API_KEY / INCREASE_ACCOUNT_ID / INCREASE_WEBHOOK_SECRET stay set until the 7 settle. A follow-up (not this spec) deletes the read code + env once nothing is in flight.

## New GoACH branches (paths that are currently Increase-only)
Each mirrors the existing GoACH debit/credit pattern (ensureGoachBankAccount + createTransaction), gated by goachProductionReady:
- **acceptOffer auto-fund** (src/actions/offers.ts ~682-813): Increase disbursement block -> GoACH Credit (descriptor "PENNYLIME ADV"), writing goachDisburseUuid + the shared status fields, preserving the surrounding schedule/notification logic.
- **portal-payoff** (src/actions/portal-payoff.ts): the payoff debit -> GoACH Debit (descriptor "PENNYLIME PAYOFF").
- **portal-skip** (src/actions/portal-skip.ts): the skip/fee debit -> GoACH Debit (descriptor "PENNYLIME SKIP" or existing descriptor).

## Processor conditionals collapsed to GoACH
- initiateACHDebit (plaid-transfer.ts): drop the Increase else-branch; always GoACH (guarded). applyDebitInitiation stays but always processor "goach".
- fundApplication (applications.ts): drop the Increase else-branch; always GoACH (guarded).
- chargePartialPayment (payments.ts): drop the Increase else-branch; always GoACH (guarded).

## Shared schema fields (DO NOT remove)
Payment.increaseTransferId/increaseTransferStatus/increaseReturnReason/achTransferId/goachTransactionUuid; Application.increaseTransferId/increaseTransferStatus/increaseDisburseError/goachDisburseUuid; PaymentAttempt.increaseTransferId/increaseTransferStatus. GoACH reuses increaseTransferId as the attempt lookup key and increaseReturnReason for the humanized reason. These stay.

## Admin UI
- Remove the Increase test page + nav.
- "Sync from Increase" button on the payment schedule card + syncIncreaseForApplication stay (they sync the in-flight legacy rows); relabel to "Sync status" so it is processor-agnostic. GoACH single-payment refresh already exists in refreshPaymentStatus.

## Error handling
- Any origination when goachProductionReady() is false returns { success:false, error:"GoACH production not configured" } (or the path's error shape) and charges nothing.
- Removing the switch must not break callers of getPaymentProcessor: either keep the function returning a constant "goach" (simplest, fewest edits) or remove it and update callers. Prefer keeping it returning "goach" to minimize churn, with a comment that it is now constant.

## Testing
- Unit: goachProductionReady (true only for login.goach.com base + configured; false for staging or unconfigured).
- Full suite green; build green.
- Manual: with staging env, every origination path (charge, custom charge, fund, payoff, skip, auto-fund) returns "GoACH production not configured" and charges nothing. The Increase status polls still update the 7 in-flight legacy rows. The GoACH test page (kept) still works against staging.

## Rollout
Deploy with GoACH staging env (charging is guard-blocked, so no real money moves and nothing fake-charges). When the GoACH production key arrives: set prod env (GOACH_BASE_URL=https://login.goach.com/api/v1, prod key, prod originator uuid); goachProductionReady flips true and all origination resumes on GoACH. Increase read-sync keeps clearing the in-flight 7; once they are all terminal, a follow-up removes the Increase read code + env.

# GoACH Payment Processor Integration - Design Spec

Date: 2026-07-16
Status: Approved by Bar (conversation)

## Summary

Add GoACH as an alternate ACH processor behind PennyLime's existing money layer, selectable by a switch, so debits (repayments) and credits (disbursements) can move from Increase to GoACH without changing anything above the money layer (dialer charge buttons, payment crons, schedule all unchanged). Build and test entirely against GoACH staging; flip to production per-direction when GoACH issues a prod key and enables credit origination.

## Verified GoACH API facts (tested live on staging)

- Base URL: staging `https://staging.goach.com/api/v1/`, prod `https://login.goach.com/api/v1/`.
- Auth header: `Authorization: Bearer <API_KEY>`.
- Response envelope: `{ data, errors, status, details: { total_count, returned_count, new_pointer, remaining_count } }`. List endpoints paginate with a `new_pointer` cursor.
- Object graph: Receiver (borrower) -> BankAccount (their bank) -> AchTransaction (Debit|Credit). OriginatorAchAccount = our source account (its uuid is `originator_ach_account_id` on every transaction).
- Create transaction: `POST /ach_transactions` form fields `originator_ach_account_id`, `bank_account_id`, `amount`, `transaction_type` (Debit|Credit, default Debit), optional `descriptor`, optional `poa_file`. Returns AchTransaction with `uuid`, `transaction_id` (e.g. FI1101176390), `current_status`, `deposit_date`.
- Cancel same-day: `POST /ach_transactions/{uuid}/cancel`.
- Status: `GET /ach_transactions/{uuid}`; batch changes `GET /ach_transactions/daily_update` returns `[{ date, ach_transaction_uuid, uuid, updates: { current_status: [from, to] } }]` with a `new_pointer` cursor - ideal for a daily sync cron.
- Statuses observed/known: Pending, Processed, Originated, Funded/Deposited (success), Returned (with `return_code` Rxx), NSF (R01), Failed, Cancelled; NOC corrections carry `noc_code` (Cxx) + `noc_history`.
- POA: transactions above a configured dollar threshold require a `poa_file` (image or PDF) uploaded with the transaction (the New Transaction UI has an "Upload Proof of Authorization" field). Threshold to be confirmed with GoACH.
- Create receiver `POST /receivers` (name required; email, custom_1, custom_2 optional). Create bank account `POST /bank_accounts` (name, receiver_id, routing_number, account_number, business, checking).

## Architecture

A thin processor selector. `initiateACHDebit` (src/lib/plaid-transfer.ts) and `fundApplication` (src/actions/applications.ts) branch on a configured processor name and call either the existing Increase path or a new GoACH path. Return shapes are preserved so no callers change. GoACH identifiers are stored in NEW distinct fields (never overloaded onto the increase* fields) so both processors can coexist and the status cron can tell them apart.

### Config (switch is admin-toggleable; creds are env)

- `TrackingConfig.paymentProcessor String @default("increase")` - "increase" | "goach". Editable on the admin tracking settings page (reversible without deploy).
- `TrackingConfig.goachDailyUpdatePointer String?` - saved cursor for the status cron.
- Env (Railway): `GOACH_API_KEY`, `GOACH_BASE_URL` (defaults to staging), `GOACH_ORIGINATOR_UUID` (our originator_ach_account uuid). Read via a small config accessor; missing key -> GoACH paths return a clear error and the switch effectively stays on Increase.

### Schema (additive migration, prod-drift-safe hand-written pattern)

- Payment: `processor String?` (which processor originated the current in-flight transfer), `goachTransactionUuid String? @unique`.
- Application: `goachReceiverUuid String?`, `goachBankAccountUuid String?`.
- TrackingConfig: the two fields above.
- Reuse existing `increaseReturnReason` for the human-readable return string on either processor (it is processor-neutral text).

### GoACH client (src/lib/goach.ts, server-only)

Typed wrappers over fetch (form-encoded / multipart):
- `goachConfigured(): boolean`
- `createReceiver({ name, email?, custom1? }) -> { uuid }`
- `createBankAccount({ name, receiverUuid, routingNumber, accountNumber, business, checking }) -> { uuid }`
- `createTransaction({ bankAccountUuid, amountCents, type: "Debit"|"Credit", descriptor?, poaFilePath? }) -> { uuid, transactionId, status }`
- `getTransaction(uuid) -> AchTransaction`
- `cancelTransaction(uuid) -> { status }`
- `dailyUpdate(pointer?) -> { changes: Array<{ transactionUuid, from, to, cursorUuid }>, newPointer, remaining }`
- Pure, unit-tested `mapGoachStatus(current_status, return_code?) -> { paymentStatus, isSettled, isReturned }` mapping to our Payment statuses.

### Receiver/bank provisioning (parallels ensureIncreaseExternalAccount)

`ensureGoachBankAccount(applicationId) -> { ok, receiverUuid, bankAccountUuid } | { ok:false, error }`: if the Application already has cached uuids, return them; else read Plaid Auth routing/account (same `authGet` the Increase path uses), create a GoACH receiver (name = borrower name, custom_1 = applicationCode) and bank account, cache both uuids on the Application, return them. Idempotent.

### Debit path

In `initiateACHDebit(paymentId)`: after computing amountCents (amount + lateFee), read `paymentProcessor`. If "goach" and configured: `ensureGoachBankAccount`, `createTransaction({type:"Debit", descriptor:"PENNYLIME PMT"})`, on success set `Payment.processor="goach"`, `Payment.goachTransactionUuid=uuid`, and return `{ success:true, transferId: uuid }` (callers already write increaseTransferId from the returned transferId - so ALSO store the uuid there is NOT done; instead callers must be updated minimally to record the returned id into the processor-appropriate field). To keep callers unchanged, `initiateACHDebit` itself performs the Payment write-back for the GoACH branch (processor + goachTransactionUuid + attempt row via recordAttemptStart with transferId=uuid) and returns the same `{success, transferId}` shape; the Increase branch keeps its current caller-side write-back. Callers that write `increaseTransferId = transferId` unconditionally must be guarded to only do so for the increase processor (audit the 5 callers; centralize the write-back into initiateACHDebit to remove that duplication).

### Credit / disburse path

In `fundApplication`: read `paymentProcessor`. If "goach": `ensureGoachBankAccount`, `createTransaction({type:"Credit", descriptor:"PENNYLIME ADVANCE"})`, on success write Application `status="FUNDED"`, `fundedAt`, `fundedAmount`, `processor`-appropriate id: store the GoACH tx uuid in a new `Application.goachDisburseUuid String?` (add to schema) and set `increaseDisburseError=null`. Preserve the existing return shape.

### Status sync (src/app/api/cron/payment-status/route.ts)

Add a GoACH branch: if `paymentProcessor === "goach"` OR there exist Payments/Applications with `goachTransactionUuid`/`goachDisburseUuid`, pull `dailyUpdate(pointer)` looping over the cursor, and for each change match the Payment by `goachTransactionUuid` (or Application by `goachDisburseUuid`), map the new status via `mapGoachStatus`, write Payment `status`/`paidAt`/`increaseReturnReason` and mirror onto PaymentAttempt via `updateAttemptStatus` (keyed by the same uuid stored as increaseTransferId? No - updateAttemptStatus keys on increaseTransferId; for GoACH the attempt stores the uuid there too via recordAttemptStart transferId param, so keying works). Save the new pointer to `TrackingConfig.goachDailyUpdatePointer`. Then run the existing `refreshApplicationStatusFromPayments` cascade unchanged. Keep the Increase branch exactly as-is. Also support a per-payment `getTransaction` fallback for admin "Refresh" on a single GoACH payment.

### POA files

`createTransaction` accepts an optional `poaFilePath` and sends it as multipart `poa_file` when present. For v1, attach the application's signed agreement PDF if one exists on disk/storage; otherwise send without it (works under the POA threshold). If GoACH rejects for missing POA, surface the error to the caller (payment goes FAILED with a clear message) rather than silently retrying. Confirm the threshold with GoACH; a follow-up will make the attachment automatic for all large transactions.

## Return code mapping

Reuse `explainReturnCode(code)` from src/lib/ach-return-codes.ts for GoACH `return_code` (same R-code namespace). NOC (`noc_code`/`noc_history`) is logged as an Activity/note on the payment, not a status change.

## Error handling

- GoACH not configured (no key) while switch is "goach": debit/credit return `{ success:false, error:"GoACH not configured" }`; nothing charged.
- Network/5xx from GoACH: treated as a failed initiation (Payment FAILED, retryable by the existing retry cron), same as an Increase initiation failure.
- Cancel only valid same-day; a failed cancel returns the error to the admin UI.
- The switch never silently moves money: changing `paymentProcessor` only affects NEW transactions; in-flight transfers keep syncing on whichever processor originated them (that is why `Payment.processor` is stored per-payment).

## Testing

- Unit (vitest): `mapGoachStatus` (all statuses incl. return codes), the daily_update parser (cursor + change extraction), amount-cents formatting.
- Integration against staging (real key): a scripted end-to-end (create receiver -> bank account -> debit $1 -> read status -> cancel) as a runnable script under scripts/, not a CI test.
- Manual: set `paymentProcessor=goach` in a staging/preview config, charge a test payment from the dialer, watch it originate on GoACH and sync back; fund a test application (credit); flip back to increase and confirm Increase still works.

## Rollout

1. Ship all code with `paymentProcessor` defaulting to "increase" (zero behavior change in prod).
2. Set GoACH staging env vars on Railway; validate the full flow against staging with the switch flipped in a non-prod context.
3. When GoACH issues a production key and enables credit origination: set prod env vars, flip `paymentProcessor` to "goach" for debits first, then disbursements, monitoring the status cron. Instant rollback = flip the field back to "increase".

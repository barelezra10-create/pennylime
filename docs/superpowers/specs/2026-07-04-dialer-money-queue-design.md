# Dialer Workspace v2: Money Panel, Charge on Call, Queue Mode - Design Spec

Date: 2026-07-04
Status: Approved by Bar (conversation)

## Summary

Three additions to /admin/dialer: (1) a Money panel on the Contact tab showing the selected client's balance, missed payments, and next due; (2) charge-on-call buttons reusing the existing audited Increase ACH actions (recharge a specific missed payment, or charge a custom agreed amount); (3) a call-run queue that dials contacts one after another, LATE stage first then REPAYING by default, advancing after each wrap-up.

Out of scope: new payment rails or charge logic (everything reuses src/actions/payments.ts), editing the payment schedule from the dialer, SMS follow-ups, multi-agent queue coordination.

## Existing infrastructure this builds on (verified)

- `chargePaymentNow(paymentId)`, `retryPayment(paymentId)`, `chargePartialPayment(paymentId, amount)` in src/actions/payments.ts: session-gated, audit-logged, Increase ACH via initiateACHDebit/safeDebit, attempts recorded as admin:<email>.
- `getPaymentsSummary(applicationId)` returns totalOwed, totalPaid (collectedAmount-aware), totalLateFees, remainingBalance, nextPayment.
- Contact -> primary application resolution: the getContact pattern (linked app, else findMany by ssnHash OR email, sorted by STATUS_PRIORITY with FUNDED/LATE first).
- ACH return reasons humanized by src/lib/ach-return-codes.ts (increaseReturnReason already stored on Payment).

## 1. Money panel (Contact tab, between header and Notes)

New server action `getContactMoney(contactId)` in src/actions/payments.ts (or contacts.ts, implementer picks the file that avoids circular imports), session-gated:

- Resolves the contact's primary application (same priority logic as getContact; extract or replicate the resolver).
- Returns null when the contact has no funded/active application (panel renders "No active advance").
- Returns: `{ applicationId, applicationCode, status, remainingBalance, totalOwed, totalPaid, totalLateFees, paidCount, totalCount, nextDue: {paymentId, amount, lateFee, dueDate, status} | null, missed: Array<{paymentId, paymentNumber, amount, lateFee, collectedAmount, outstanding, dueDate, status, returnReason}> }`.
- `missed` = payments with status in [FAILED, LATE, RETURNED, COLLECTIONS] plus PENDING rows past dueDate, ordered by dueDate asc. `outstanding` = amount + lateFee - collectedAmount.

Panel UI (new component `src/app/admin/dialer/money-panel.tsx`, client):

- Summary strip: Remaining balance (large), late fees total, "paid X of Y", next due (date + amount), red LATE pill when application status is LATE or any missed rows exist.
- Missed list: one row per missed payment: "#4 - $186.30 (+$15 late fee) - due Jun 12 - Insufficient funds" with a **Charge** button -> `retryPayment(paymentId)` (covers FAILED/LATE/RETURNED/COLLECTIONS and overdue PENDING per its allowlist).
- Custom charge: amount input (dollars, 2 decimals) + **Charge now** button -> `chargePartialPayment(oldestMissedPaymentId, amount)`. Disabled when there are no missed payments (chargePartialPayment needs a target payment). Cap client-side at the oldest missed payment's outstanding; show the cap next to the input ("max $201.30 on payment #4").
- Confirm step for every charge: button flips to "Confirm charge $X?" for 5 seconds; second tap fires. While in flight: spinner; result inline: "ACH debit initiated" (green) or the action's error message (red).
- After any successful charge, refetch getContactMoney so the row shows PROCESSING.
- Race guard: reuse the workspace's selectedIdRef pattern; a money fetch or charge result for a contact no longer selected is dropped.

## 2. Queue mode (call run)

State machine inside dialer-workspace.tsx (no server changes):

- **Start call run** button above the contact list. Queue construction at click time from the already-loaded contacts array: if the user has an active search/stage filter, queue = current filtered list in displayed order; otherwise queue = all LATE-stage contacts, then all REPAYING-stage contacts. Contacts without phones are skipped at build time. Empty queue -> button disabled with tooltip.
- Run state: `{ queue: ContactRow[], index: number, status: "dialing" | "in-call" | "between" | "paused" } | null`.
- On start and on each advance: selectContact(next) then startCall for that contact.
- Advance trigger: when the dialer state transitions from wrap-up to idle (wrap-up saved or dismissed) while a run is active, enter "between": show "Calling next in 3..." countdown (3s), then dial the next contact. Pause during countdown stops the advance ("paused"; Resume continues).
- Queue bar (replaces the tab row while a run is active): "Call run: {index+1} of {queue.length} - {current name}" + Pause/Resume, Skip (hang up if live, advance immediately), End run.
- Error handling: if startCall lands in the error phase (mic denied, unconfigured), the run auto-pauses with the error visible. If a queued contact was called manually meanwhile, it still gets its turn (no dedup; YAGNI).
- Leaving the page ends the run (component state only).

## 3. Wiring

- dialer-workspace.tsx: Contact tab renders `<MoneyPanel contactId=... />` between header and Notes; queue bar + run logic added; "Start call run" button above the list.
- MoneyPanel fetches via getContactMoney on mount/contact change.
- No schema changes, no new API routes, no middleware changes.

## Error handling summary

- No active advance: informational empty state, charge controls hidden.
- Charge action returns { success: false, error }: shown inline, panel state unchanged, no refetch.
- getContactMoney failure: "Could not load balance" with a Retry button.
- Queue with zero eligible contacts: disabled start button.

## Testing

- Unit tests (vitest): queue-order builder (pure function `buildCallQueue(contacts, filterActive, filteredList)` extracted to src/app/admin/dialer/call-queue.ts: LATE then REPAYING default, filtered passthrough, no-phone skip) and the missed-payment selector logic in getContactMoney if extracted pure (`selectMissedPayments(payments, now)` in src/lib/loan-summary.ts or a new pure helper).
- Manual: select late client -> balance + missed rows correct vs application page; charge custom $1 on a test payment; run queue over 2-3 contacts with wrap-ups; pause/skip/end.

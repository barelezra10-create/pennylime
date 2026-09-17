# Collections and settlements workspace

The `/support` landing tab is now **Overdue & defaults**. Existing chats, emails, and tickets remain available.

## Workflow

1. Search/filter the collections queue by account, ownership, follow-up, or settlement status.
2. Open an account to call with the existing Twilio dialer, review call history, assign yourself, record notes, schedule follow-ups, or create a support ticket.
3. A staff member with existing non-SUPPORT payment permissions can prepare a settlement: total, installment count, weekly/biweekly/monthly cadence, first payment, signing deadline, and required reviewed agreement text.
4. Review the exact draft and schedule, then explicitly send the email. Drafting and sending leave existing payments unchanged.
5. The customer signs in to their own portal account, reviews the contract and ACH authorization, checks both consent boxes, and types their legal name. The signed agreement remains printable in the portal.
6. Signing replaces unpaid installments atomically. Old payments are retained as canceled, with a settlement reference; previously paid rows and original agreements remain intact. The account returns to REPAYING. Scheduled payments use the existing processor, and the manager can collect due installments from the Payments tab.

## Financial behavior

- One pending draft/sent settlement per application, enforced by a partial unique database index.
- Settlement cannot exceed the current unpaid balance. Exact-cent schedules adjust the final installment; monthly dates clamp to month end and move weekend dates forward.
- Debits in processing and stale financial snapshots block signing. Customers can only access and sign agreements for their authenticated application.
- Serializable replacement transactions and conditional payment claims protect against concurrent scheduled/retry/manual payment processing.
- Replaced installments are blocked at the gateway. Active settlement installments cannot be collected before their signed due date.
- Partial collection reduces subsequent scheduled debit amounts. Attempt history records the amount actually requested.
- Automatic NSF rolling and late fees do not rewrite settlement installments. Legacy portal payoff/skip tools are blocked for pending/signed settlements. A new agreement is required to renegotiate.
- Agreement wording, schedule, previous ledger snapshot, hash, signer, server-observed IP/user agent, and audit events are retained. No template wording is supplied automatically.
- Existing payment-role permissions are unchanged. SUPPORT users can triage, call, and record notes; staff with existing payment permissions can draft/send agreements and charge installments.

## Release and verification

Apply `20260917180000_collections_settlements` before starting the updated app (the existing production start command runs Prisma migrations). It adds CollectionCase and SettlementAgreement plus two Payment references. No production migration or data change was performed during development.

Automated coverage includes schedule rounding, invalid terms, partial collections, superseded rows, account-bound signatures, missing consent, expiry, changed/in-flight payments, repeat acceptance, staff permissions, and stale payment claims. Desktop/mobile review uses a separate local bundle with fictional data and mocked actions; it does not call Twilio, send email, sign a real contract, or move money. Real provider delivery/calling/debits remain a staging verification step.

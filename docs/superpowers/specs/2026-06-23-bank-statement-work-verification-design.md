# Bank Statement Upload + Work Verification — Design

Date: 2026-06-23
Project: PennyLime (`~/pennylime`)
Status: Approved direction, pending spec review

## Goal

Add a mandatory step to the apply flow where every applicant uploads a 90-day bank
statement, plus a supporting proof-of-work document, and add an automated check that
confirms the applicant really does the gig/business work they declared. Verification
failures soft-flag the application for manual review; they never block submission.

## Decisions (locked)

- **Statement upload:** mandatory for every applicant, in addition to the existing Plaid link.
- **Work verification:** auto-match deposits in the bank data AND require an extra proof doc.
- **Failure path:** soft flag to manual review. Submission always succeeds.
- **Engine:** deterministic comparator that reuses the existing Gemini statement parser and
  Plaid classification (Approach A), not a pure-AI verifier.
- **Step layout:** one combined "Documents" step with two upload zones.
- **Verification timing:** runs at submit, server-side. No spinner/wait for the applicant.

## What already exists (reuse, do not rebuild)

- `src/actions/bank-statements.ts` — `uploadBankStatements(applicationId, formData)` stores files
  as `Document` rows with `documentType: "BANK_STATEMENT_90D"`; `parseBankStatementsWithAI(applicationId)`
  runs the statement through Gemini. **Admin-only today.**
- `src/lib/bank-statement-parser.ts` — `parseStatementsWithAI(pdfs)` -> `ParsedStatementSummary`
  (deposits[], monthlyIncome, avgWeeklyIncome, depositCount, cadence). Already identifies
  gig-platform payouts.
- `src/actions/classify-transactions.ts` — groups Plaid deposits by normalized counterparty and
  matches against known platforms.
- `src/lib/risk/ai-risk.ts` — `runAiRiskAnalysis()` produces `APPROVE | MANUAL_REVIEW | REJECT`
  from the combined data. Reads income/deposit fields off the `Application`.
- `src/lib/storage.ts` — `storage.upload()/read()` local provider.
- `Document` model — `applicationId`, `fileName`, `mimeType`, `fileSize`, `storagePath`,
  `documentType` (default `PAY_STUB`).
- Apply page already has leftover copy "Last step is your earnings statements" — the step was
  planned but never built.

## Architecture constraint

There is **no `Application` row during the apply flow**. Plaid tokens and all field data are held
in React state on `src/app/apply/page.tsx` and the row is created only at `submitApplication`
(`src/actions/applications.ts:60`, returns `applicationId`). The Documents step must follow the
same pattern: hold the two `File` objects in component state, then persist + verify immediately
after `submitApplication` returns the new id.

## Components

### 1. New applicant step — "Documents"
- Inserted into `STEPS` (`src/app/apply/page.tsx:28`) after `Classify` (index 8), before `Verified`.
  New order: ... `Classify`, **`Documents`**, `Verified`, `Review`.
- Two required upload zones (cannot advance until each has at least one accepted file):
  - **90-day bank statement** — PDF / image / CSV. Same `ALLOWED_TYPES` as `src/app/api/upload/route.ts`.
  - **Proof of work** — conditional copy by `workerType`:
    - `INDEPENDENT_CONTRACTOR`: "Upload an Uber/Lyft/DoorDash earnings screenshot or your 1099."
    - `BUSINESS_OWNER`: "Upload a business license, EIN letter, or a payment-processor statement."
- Files held in React state. No upload happens until submit.
- New step component lives next to the other step components in `page.tsx` (matches existing pattern).

### 2. Persist + verify on submit — new server action `finalizeDocumentsAndVerify`
- New file `src/actions/application-documents.ts` (keeps `applications.ts` from growing further).
- Signature: `finalizeDocumentsAndVerify(applicationId: string, formData: FormData)` where formData
  carries the statement file(s) under `statement` and the proof file(s) under `workProof`.
- Steps:
  1. Store statement files -> `Document` rows `documentType: "BANK_STATEMENT_90D"` (reuse `uploadBankStatements` internals or call storage directly).
  2. Store proof files -> `Document` rows new `documentType: "WORK_PROOF"`.
  3. Call `parseBankStatementsWithAI(applicationId)` to populate parsed deposits / verified income.
  4. Call `verifyWorkSignals(applicationId)` (below).
  5. Best-effort, fire-and-forget allowed for parse/verify so a slow Gemini call never blocks the
     applicant's confirmation screen (mirrors existing fire-and-forget SMS pattern). Verification
     result is admin-facing only.
- Apply page submit handler (`src/app/apply/page.tsx:3199`) calls `submitApplication(...)`, then on
  success builds a `FormData` from the two held files and calls `finalizeDocumentsAndVerify`.

### 3. Work-verification comparator — `verifyWorkSignals(applicationId)`
- New file `src/lib/risk/work-verification.ts` + thin server action wrapper.
- Inputs: the `Application` (workerType, platform, businessType), parsed-statement deposits, and
  Plaid classified deposits (whichever are present).
- Logic:
  - Build a normalized counterparty list from both deposit sources.
  - `INDEPENDENT_CONTRACTOR`: match against gig-platform keywords (Uber, Lyft, DoorDash, Uber Eats,
    Instacart, Grubhub, Amazon Flex, Postmates, TaskRabbit, Fiverr, Upwork, Shipt, Gopuff, Spark) —
    reuse the existing `GIG_PLATFORMS` list as the source of truth, moved to a shared constant.
  - `BUSINESS_OWNER`: match against a new `PROCESSORS` keyword list (Stripe, Square, Toast, Clover,
    Shopify, PayPal, Venmo business, SumUp, Helcim, Authorize.net) OR repeated inbound deposits from
    a consistent counterparty.
  - Status:
    - `VERIFIED` — declared-type deposits found with meaningful count/total over the period.
    - `WEAK` — some matching signal but thin (few/small deposits, short history).
    - `UNVERIFIED` — no deposits matching the declared work.
  - Produce a human-readable `reason` string, e.g. "Found 11 Uber deposits totaling $4,200 over 90
    days" or "No deposits matching declared platforms (Uber, Lyft)".
- Output written to the `Application` (see schema). `WEAK`/`UNVERIFIED` also sets the manual-review flag.

### 4. Schema additions (`prisma/schema.prisma`, `Application`)
- `workVerificationStatus String?` — `VERIFIED | WEAK | UNVERIFIED`
- `workVerificationJson   String?` — matched counterparties, totals, reason (structured JSON)
- `workVerificationAt     DateTime?`
- Add `workNeedsReview Boolean @default(false)` — an explicit, separately-queryable flag, kept
  distinct from the existing `identityNeedsReview` so the two review reasons don't collide.
- New `documentType` value `"WORK_PROOF"` (string column, no enum change needed).
- Postgres migration via `prisma migrate dev` locally, `prisma migrate deploy` runs on Railway build.

### 5. Feed verification into AI risk
- Extend the `ai-risk.ts` prompt input with the work-verification status + reason so the AI verdict
  accounts for unverified work (e.g. nudges toward `MANUAL_REVIEW`). Read the new fields in the
  existing `select` and add a line to the prompt's applicant-context block.

### 6. Admin surfacing
- `src/app/admin/applications/[id]/detail-client.tsx` — add a "Work verification" panel showing
  status badge + reason, and ensure the two uploaded `Document`s (statement, work proof) are listed
  with view/download links (the doc list UI already exists for admin-uploaded statements).

## Data flow

```
Applicant: Documents step (hold statement + proof files in state)
   -> Review -> Submit
      -> submitApplication()  [creates Application row, returns id]
      -> finalizeDocumentsAndVerify(id, formData)
           -> store Documents (BANK_STATEMENT_90D, WORK_PROOF)
           -> parseBankStatementsWithAI(id)      [Gemini -> deposits, income]
           -> verifyWorkSignals(id)              [deterministic match -> status + reason]
                -> writes workVerificationStatus/Json/At, sets workNeedsReview
           -> (ai-risk picks up status on next runAiRiskAnalysis)
Admin: detail page shows status, reason, both docs
```

## Error handling

- Upload type/size errors surface in the Documents step using the existing `ALLOWED_TYPES` +
  `max_file_size_mb` rules; the applicant must fix before advancing.
- Parse failure (Gemini down / unreadable statement): `verifyWorkSignals` falls back to Plaid
  deposits only; if neither source has data, status = `UNVERIFIED` with reason "Could not read
  statement; manual review needed", and `workNeedsReview = true`. Submission still succeeds.
- `finalizeDocumentsAndVerify` failures are caught and logged (AuditLog) without failing the
  applicant's submission — the Application already exists; admin can re-request docs.

## Testing

- Unit: `verifyWorkSignals` against fixture deposit sets — driver with clear Uber deposits
  (`VERIFIED`), driver with none (`UNVERIFIED`), business with Stripe settlements (`VERIFIED`),
  thin history (`WEAK`), unreadable statement (`UNVERIFIED` fallback).
- Unit: normalized counterparty matcher (case, punctuation, "UBER *EATS", "DD DOORDASH", etc.).
- Integration: `finalizeDocumentsAndVerify` creates both `Document` rows with correct types and
  writes the verification fields.
- Manual: run the apply flow end-to-end in dev, confirm the Documents step gates on both files,
  confirm admin detail page shows the panel + docs.

## Out of scope (YAGNI)

- Real-time in-step verification feedback (decided: server-side at submit only).
- OCR/anti-fraud forgery detection on the proof doc (manual review covers it for now).
- Replacing Plaid or making statement upload conditional.
- Cloud object storage migration (local `storage` provider stays).

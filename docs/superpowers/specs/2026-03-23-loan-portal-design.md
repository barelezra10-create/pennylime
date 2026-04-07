# Loan Portal — Full Platform Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Project:** `/Users/baralezrah/loan-portal`

## Overview

A lending platform targeting gig workers (DoorDash, Uber, Lyft, etc.) that handles the full loan lifecycle: application intake, bank verification via Plaid, automated risk-based approval, ACH payment collection, and portfolio risk management. Loans range $100–$10K, up to 18 months, with dynamic interest rates that guarantee a minimum 25% return across the loan portfolio (not per individual loan — some loans will default, and pricing must ensure the performing loans cover those losses plus the 25% profit target).

**All times in this document are US Eastern (ET).**

The platform evolves in 3 phases: rule-based decisions first, automated payment collection second, and data-driven risk scoring third as historical loan outcome data accumulates.

## Current State

The portal has a working MVP with:
- 6-step application form (loan amount, personal info, platform, SSN, document upload, review)
- Public status checker by application code
- Marketing landing page targeting gig workers
- Admin panel with login, dashboard, application detail, settings
- Manual approve/reject with configurable rules (income ratio, loan limits)
- File upload with local storage (S3-ready abstraction)
- NextAuth authentication, Prisma + SQLite

**Key gaps:** Platform and SSN fields collected but not persisted. No bank linking, no payment processing, no email notifications, no audit trail, no risk scoring.

---

## Phase 1: Core Lending Infrastructure

### 1.1 Database Schema Changes

#### Application (expanded fields)

| Field | Type | Purpose |
|---|---|---|
| `platform` | String | Gig platform (Uber, DoorDash, etc.) |
| `ssnEncrypted` | String | AES-256 encrypted SSN |
| `ssnHash` | String | SHA-256 hash (with fixed salt) for duplicate detection |
| `plaidAccessToken` | String | Encrypted Plaid access token for bank |
| `plaidAccountId` | String | Linked bank account ID |
| `plaidItemId` | String | Plaid item reference |
| `plaidLinkStale` | Boolean @default(false) | True if bank credentials expired, needs re-link |
| `monthlyIncome` | Decimal | Verified income via Plaid |
| `riskScore` | Decimal? | 0–100, calculated by risk engine |
| `interestRate` | Decimal? | Annual %, set at approval |
| `loanTermMonths` | Int? | Approved loan term |
| `approvedBy` | String? | Admin user ID who approved |
| `approvedAt` | DateTime? | Approval timestamp |
| `fundedAt` | DateTime? | When wire was sent |
| `fundedAmount` | Decimal? | Actual funded amount |

#### New Model: Payment

```
id              String    @id @default(uuid())
applicationId   String    (FK → Application)
amount          Decimal   (total payment amount)
principal       Decimal
interest        Decimal
lateFee         Decimal   @default(0)
dueDate         DateTime
paidAt          DateTime?
status          String    (PENDING | PROCESSING | PAID | FAILED | LATE | COLLECTIONS)
paymentNumber   Int       (sequence: 1 of 12, 2 of 12, etc.)
achTransferId   String?   (Plaid Transfer reference)
retryCount      Int       @default(0)
lastRetryAt     DateTime?
createdAt       DateTime  @default(now())
```

#### New Model: RiskProfile

```
id              String    @id @default(uuid())
applicationId   String    (FK → Application, source loan)
platform        String
monthlyIncome   Decimal   (actual income, for numeric similarity matching)
loanAmount      Decimal   (actual loan amount, for numeric similarity matching)
loanTermMonths  Int
interestRate    Decimal
outcome         String    (PAID_OFF | DEFAULTED | LATE_BUT_PAID)
totalPaid       Decimal
totalOwed       Decimal
latePaymentCount Int      @default(0)
defaultedAt     DateTime?
completedAt     DateTime  (when loan reached terminal state)
createdAt       DateTime  @default(now())
```

#### New Model: AuditLog

```
id              String    @id @default(uuid())
action          String    (APPROVE | REJECT | FUND | EDIT_INCOME | VIEW_SSN | CHANGE_SETTING | etc.)
entityType      String    (APPLICATION | PAYMENT | LOAN_RULE | etc.)
entityId        String
performedBy     String    (admin user ID)
details         String?   (JSON blob with before/after or context)
createdAt       DateTime  @default(now())
```

#### New Model: CollectionEvent

```
id              String    @id @default(uuid())
applicationId   String    (FK → Application)
eventType       String    (WARNING_SENT | ESCALATED | MANUAL_NOTE | DEFAULT_MARKED)
performedBy     String?   (admin user ID, for manual actions)
notes           String?
createdAt       DateTime  @default(now())
```

### 1.2 Plaid Integration

#### Updated Application Flow (7 steps)

1. **Loan amount & term** — $100–$10K slider/input + desired repayment term (3–18 months)
2. **Personal info** — first name, last name, email, phone
3. **Gig platform** — select from 14 platforms
4. **SSN** — input with format validation, encrypted before storage
5. **Bank account linking** — Plaid Link widget (NEW)
   - Borrower authenticates with their bank
   - System receives: income data, account balance, transaction history
   - Access token stored (encrypted) for future ACH pulls
6. **Document upload** — pay stubs (now supplementary since Plaid verifies income)
7. **Review & submit**

#### Plaid Products Used

| Product | Purpose |
|---|---|
| **Auth** | Get bank account/routing numbers for ACH |
| **Identity** | Verify name matches bank account holder |
| **Income** | Verify monthly income from bank data |
| **Transactions** | Spending patterns for risk scoring (Phase 3) |
| **Transfer** | ACH debit for payment collection (Phase 2) |

#### API Routes

- `POST /api/plaid/create-link-token` — generates Plaid Link session for the applicant
- `POST /api/plaid/exchange-token` — exchanges public token for access token after bank link success
- `GET /api/plaid/income/[applicationId]` — admin view of verified income data

#### Plaid Webhooks

Register a webhook endpoint at `POST /api/plaid/webhook` to handle:
- `ITEM_LOGIN_REQUIRED` — bank credentials expired. Mark the application's Plaid link as stale, email borrower to re-link, and pause ACH attempts until re-linked.
- `TRANSFER_EVENTS_UPDATE` — real-time transfer status updates (supplement polling).
- `INCOME_VERIFICATION` — income data ready after async processing.

#### Bank Re-Link Flow

If a borrower's bank connection expires mid-loan:
1. Plaid sends `ITEM_LOGIN_REQUIRED` webhook
2. System marks application as `plaidLinkStale = true`
3. Email sent to borrower with a re-link URL: `/relink/[applicationCode]`
4. Re-link page shows Plaid Link in update mode (uses existing access token)
5. On success: clear stale flag, resume ACH processing
6. If not re-linked within 7 days: escalate to admin

#### Cost

~$1–5 per bank link depending on products enabled. Income verification is a premium product.

### 1.3 Approval Engine (Rule-Based)

#### Pre-Screening Rules (configurable via admin settings)

| Rule | Default | Description |
|---|---|---|
| `loan_limit` | $10,000 | Max loan amount |
| `min_loan` | $100 | Min loan amount |
| `income_multiplier_ratio` | 2.0 | Verified monthly income × loan term (months) ≥ ratio × loan amount. Example: $3K/mo income, 6-month loan, ratio 2.0 → $3K × 6 = $18K ≥ 2.0 × $5K = $10K → passes |
| `min_bank_balance` | $200 | Minimum bank balance at time of application |
| `required_pay_stubs` | 3 | Minimum uploaded documents |
| `max_loan_term_months` | 18 | Maximum repayment period |
| `min_interest_rate` | 30 | Floor interest rate (annual %) |
| `late_fee_amount` | 25 | Flat late fee per missed payment |
| `late_fee_grace_days` | 3 | Days after due date before late fee applies |
| `collections_threshold_days` | 30 | Days overdue before collections escalation |

#### Decision Flow

1. Validate loan amount within min/max limits
2. Check verified income (from Plaid) against income multiplier ratio
3. Check bank balance meets minimum
4. Check required documents uploaded
5. Check no duplicate SSN in system (via `ssnHash` column lookup — GCM encryption produces different ciphertext each time, so hash is needed for dedup)
6. Generate recommendation: APPROVE / REJECT / MANUAL_REVIEW (these are recommendations, not statuses — admin makes the final status change)
7. If APPROVE: calculate interest rate based on risk tier
8. Admin reviews recommendation, makes final decision
9. All actions logged to AuditLog

#### Interest Rate Calculation (Phase 1 — simple)

```
baseRate = min_interest_rate (from settings, default 30%)
```

All borrowers get the base rate in Phase 1. Dynamic pricing comes in Phase 3 when there's enough data.

### 1.4 Audit Trail

Every admin action creates an AuditLog entry:

| Action | Logged Details |
|---|---|
| APPROVE | Application ID, approved terms, risk score |
| REJECT | Application ID, rejection reason |
| FUND | Application ID, funded amount, funding date |
| EDIT_INCOME | Before/after income values |
| VIEW_SSN | Application ID (tracks who viewed sensitive data) |
| CHANGE_SETTING | Rule key, before/after values |
| LOGIN | Admin user ID, timestamp |

Admin panel gets an "Audit Log" page — filterable by action type, admin user, date range.

### 1.5 SSN Encryption

- AES-256-GCM encryption using a server-side encryption key (env variable `ENCRYPTION_KEY`)
- Encrypted before writing to database
- Decrypted only when admin views it (logged in audit trail)
- Never included in API responses or list views — only on detail page with explicit "reveal" button

---

## Phase 2: Payment & Collections

### 2.1 Loan Funding

When admin marks a loan as funded:
1. Admin enters funded amount and confirms
2. System generates full amortization schedule (equal monthly payments)
3. Each payment record created with: due date, principal portion, interest portion
4. Application status changes to ACTIVE
5. Confirmation email sent to borrower with payment schedule
6. AuditLog entry created

#### Amortization Calculation

Standard amortization formula:
```
monthlyRate = annualRate / 12
monthlyPayment = principal × (monthlyRate × (1 + monthlyRate)^months) / ((1 + monthlyRate)^months - 1)
```

Each payment splits into principal and interest. Early payments are interest-heavy, later payments are principal-heavy.

### 2.2 ACH Payment Collection

**Using Plaid Transfer API:**

- Bank account already linked during application (Phase 1)
- ACH debit initiated programmatically on payment due dates
- Plaid handles the ACH network communication
- Settlement takes 2–3 business days

#### Daily Payment Flow

```
6:00 AM ET — Payment Processor Job
  → Find all payments due today with status PENDING
  → For each: set status to PROCESSING (prevents double-debit from concurrent jobs)
  → Initiate Plaid Transfer ACH debit
  → Set achTransferId on payment record
  → Status remains PROCESSING until settlement

Every 4 hours — Settlement Check Job
  → Poll Plaid Transfer API for all PROCESSING transfers
  → On success: mark payment PAID, set paidAt
  → On failure: mark payment FAILED, increment retryCount

8:00 AM ET — Retry Job
  → Find all FAILED payments (up to 30 days old, not in COLLECTIONS)
  → Retry ACH debit
  → Increment retryCount, set lastRetryAt
```

### 2.3 Failed Payment & Collections

**Timeline for a missed payment:**

| Day | Action |
|---|---|
| 0 | ACH fails → status FAILED, "payment failed" email to borrower |
| 1+ | Daily retry attempts (every day until day 30) |
| 4 | Late fee added (late_fee_grace_days=3 means fee applies on day 4, i.e., after 3 full grace days), late fee email sent |
| 7 | Formal warning email sent, CollectionEvent created |
| 14 | Second warning email, loan status → LATE |
| 30 | Stop auto-retry, loan status → COLLECTIONS, CollectionEvent escalation |
| 30+ | Admin handles manually — can retry, negotiate, or mark as DEFAULTED |

**Late Fees:**
- Flat fee (default $25, configurable in settings)
- Added to the payment record's `lateFee` field
- Collected with the next successful ACH pull (late fee + regular payment)

### 2.4 Loan Statuses

| Status | Meaning |
|---|---|
| PENDING | Application submitted, not yet decided |
| APPROVED | Approved, awaiting funding |
| REJECTED | Denied |
| ACTIVE | Funded, payments ongoing |
| LATE | Has overdue payments (14+ days) |
| COLLECTIONS | Escalated (30+ days overdue) |
| DEFAULTED | Admin marked as unrecoverable |
| PAID_OFF | All payments complete |

### 2.5 Borrower Status Page (Upgraded)

The existing status checker (`/status/[code]`) expands to show:
- Loan status and terms (amount, rate, term)
- Current balance remaining
- Next payment date and amount
- Payment history (date, amount, status)
- Outstanding late fees
- Contact information for support

### 2.6 Late Payment Recovery

When a LATE or COLLECTIONS loan receives a successful payment:
- If all overdue payments are now caught up: loan status reverts to ACTIVE
- Late fees are included in the ACH pull as a single combined transaction (regular payment + accumulated late fees)
- If only some payments caught up but others still overdue: status stays LATE
- Admin can manually waive late fees via the detail page (logged in AuditLog)

---

## Phase 3: Risk Scoring & Dynamic Pricing

### 3.1 Data Collection

Every loan that reaches a terminal state (PAID_OFF or DEFAULTED) generates a RiskProfile record:
- Borrower attributes: platform, income range, loan amount range, term
- Outcome: paid off, defaulted, or late-but-paid
- Total paid vs total owed
- Time to default (if applicable)

This builds automatically as loans are processed in Phase 2.

### 3.2 Risk Scoring Model

**Lookup-based scoring (no ML required):**

1. For a new applicant, query RiskProfile records with similar attributes:
   - Same gig platform (exact match)
   - Monthly income within ±20% of applicant's income
   - Loan amount within ±30% of requested amount
   - Loan term within ±3 months
   (RiskProfile stores actual numeric values for income/loan amount, enabling percentage-based similarity queries)
2. Calculate default rate for this cohort
3. Adjust for specific signals:
   - Bank balance relative to loan amount
   - Income stability (variance in Plaid transaction history)
   - Number of pay stubs provided
4. Score 0–100 (100 = safest)

**Minimum data threshold:** Until a cohort has ≥ 20 historical loans, fall back to rule-based decisions. The system tells the admin "insufficient data for risk scoring" and uses Phase 1 rules.

### 3.3 Dynamic Interest Rate Pricing

**Formula:**

```
interestRate = baseRate + riskPremium + defaultCoverage

Where:
  baseRate        = minimum rate for profit (from settings, e.g., 30%)
  riskPremium     = (100 - riskScore) × premiumFactor (e.g., 0.2% per risk point)
  defaultCoverage = expectedDefaultRate × coverageMultiplier
```

**The key insight:** If 10% of borrowers in a risk tier default, the interest charged to the other 90% must cover those losses plus the 25% minimum profit target.

```
requiredPortfolioReturn = 1.25 (25% profit)
effectiveRate = requiredPortfolioReturn / (1 - defaultRate)

Example:
  10% default rate → effectiveRate = 1.25 / 0.90 = 1.389 → ~39% annual rate
  20% default rate → effectiveRate = 1.25 / 0.80 = 1.5625 → ~56% annual rate
  5% default rate  → effectiveRate = 1.25 / 0.95 = 1.316 → ~32% annual rate
```

Admin can always override the calculated rate.

### 3.4 Risk Dashboard (Admin)

New admin page showing:
- Portfolio overview: total outstanding, total collected, projected returns
- Default rate by risk tier, platform, income range
- Active vs defaulted loan ratio
- Monthly collection performance
- Risk score distribution of active loans
- Projected losses vs actual losses

---

## Email Notifications

**Provider:** Resend
**Templates:** React Email for consistent branding

| Trigger | Recipient | Content |
|---|---|---|
| Application submitted | Borrower | Confirmation + application code |
| Application approved | Borrower | Loan terms, interest rate, next steps |
| Application rejected | Borrower | Reason, reapply option |
| Loan funded | Borrower | Payment schedule, first due date |
| Payment reminder (1 day before) | Borrower | Due date, amount, balance |
| Payment successful | Borrower | Confirmation, remaining balance |
| Payment failed | Borrower | Retry notice, update bank info |
| Late fee added | Borrower | Fee amount, how to resolve |
| Warning (7 days overdue) | Borrower | Formal warning |
| Collections escalation (30 days) | Borrower | Final notice |
| New application received | Admin | Applicant summary, risk score |
| Repeated payment failure | Admin | Needs attention flag |

---

## Cron Jobs

| Job | Schedule | Description |
|---|---|---|
| `payment-processor` | Daily 6:00 AM | Initiate ACH for payments due today |
| `payment-retry` | Daily 8:00 AM | Retry failed ACH (up to 30 days old) |
| `payment-status-check` | Every 4 hours | Poll Plaid for ACH settlement status |
| `late-fee-calculator` | Daily midnight | Add late fees to payments ≥ 3 days overdue |
| `payment-reminders` | Daily 9:00 AM | Email reminders for payments due tomorrow |
| `collections-escalation` | Daily midnight | Escalate 30+ day overdue to COLLECTIONS |
| `risk-model-refresh` | Weekly Sunday | Recalculate risk scores from new outcome data |

**Implementation:** API routes under `/api/cron/` protected by a `CRON_SECRET` header. Triggered by Vercel Cron, Railway cron, or external scheduler.

---

## Security

### Data Protection
- SSN: AES-256-GCM encrypted at rest, decrypted only on admin detail view (logged)
- Plaid tokens: encrypted at rest
- Sensitive fields excluded from list/search API responses
- HTTPS enforced in production

### Application Security
- Rate limiting on public endpoints (application submit, status check)
- Input sanitization on all user inputs
- File upload: MIME type validation, size limits
- CSRF protection on forms

### Compliance Pages (Public)
- Terms of Service
- Privacy Policy
- Lending disclosures (APR, fees, terms shown before application submission)

### Audit
- Every admin action logged (immutable)
- SSN view logged separately
- Filterable audit log page in admin

### Out of Scope (Needs Legal Review)
- Full TILA/FCRA/AML compliance
- State-by-state lending license requirements
- Credit bureau reporting
- SOC2 certification

**Recommendation:** Consult a lending compliance attorney before processing real loans.

---

## API Routes (Full)

### Public
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/plaid/create-link-token` | Generate Plaid Link session |
| POST | `/api/plaid/exchange-token` | Exchange public token after bank link |
| POST | `/api/plaid/webhook` | Plaid webhook receiver |
| POST | `/api/upload` | File upload (existing) |

### Admin (authenticated)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/applications` | List applications (with status filter) |
| GET | `/api/admin/applications/[id]` | Application detail |
| POST | `/api/admin/applications/[id]/approve` | Approve with terms |
| POST | `/api/admin/applications/[id]/reject` | Reject with reason |
| POST | `/api/admin/applications/[id]/fund` | Mark as funded |
| PUT | `/api/admin/applications/[id]/income` | Update income |
| GET | `/api/admin/applications/[id]/ssn` | Reveal SSN (audit logged) |
| GET | `/api/admin/applications/[id]/payments` | Payment schedule |
| POST | `/api/admin/payments/[id]/retry` | Manual ACH retry |
| POST | `/api/admin/payments/[id]/waive-fee` | Waive late fee |
| GET | `/api/admin/audit-log` | Audit log (filterable) |
| GET | `/api/admin/settings` | Get loan rules |
| PUT | `/api/admin/settings/[key]` | Update loan rule |
| GET | `/api/plaid/income/[applicationId]` | View Plaid income data |
| GET | `/api/files/[...path]` | Serve uploaded files (existing) |

### Borrower Self-Service
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/status/[code]` | Application/loan status |
| POST | `/api/relink/[code]` | Initiate Plaid re-link |

### Cron (secret-protected)
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/cron/payment-processor` | Initiate ACH for due payments |
| POST | `/api/cron/payment-retry` | Retry failed ACH |
| POST | `/api/cron/payment-status` | Poll Plaid for settlement |
| POST | `/api/cron/late-fees` | Calculate and add late fees |
| POST | `/api/cron/reminders` | Send payment reminder emails |
| POST | `/api/cron/collections` | Escalate overdue to collections |
| POST | `/api/cron/risk-refresh` | Recalculate risk scores |

Note: Most admin actions currently use server actions (not API routes). This table documents the data endpoints needed; whether implemented as API routes or server actions is an implementation detail.

---

## Data Migration

Existing applications in `dev.db` predate the new schema fields. Migration strategy:
- New nullable fields (`platform`, `ssnEncrypted`, `ssnHash`, `plaidAccessToken`, etc.) default to `null`
- Existing applications can still be viewed and managed but cannot be approved through the new rules engine (they lack Plaid data)
- Admin can manually approve/reject legacy applications with a "legacy override" flag
- No backfill needed — these are dev/test records

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | SQLite database path | Yes |
| `NEXTAUTH_SECRET` | NextAuth session signing | Yes |
| `NEXTAUTH_URL` | App base URL | Yes |
| `ENCRYPTION_KEY` | AES-256 key for SSN/token encryption (32 bytes, hex-encoded) | Yes |
| `SSN_HASH_SALT` | Fixed salt for SSN dedup hashing | Yes |
| `PLAID_CLIENT_ID` | Plaid API client ID | Yes |
| `PLAID_SECRET` | Plaid API secret | Yes |
| `PLAID_ENV` | Plaid environment: sandbox / development / production | Yes |
| `PLAID_WEBHOOK_URL` | Public URL for Plaid webhooks | Yes (production) |
| `RESEND_API_KEY` | Resend email API key | Yes |
| `RESEND_FROM_EMAIL` | Sender email address | Yes |
| `CRON_SECRET` | Secret header for cron job authentication | Yes |
| `APP_URL` | Public app URL (for email links) | Yes |

---

## Rate Limiting

| Endpoint | Limit |
|---|---|
| `POST /api/plaid/create-link-token` | 5/min per IP |
| Application submit (server action) | 3/hour per IP |
| Status check | 10/min per IP |
| Admin login | 5/min per IP |
| Cron endpoints | 1/min (secret-gated) |

---

## Tech Stack Additions

| Addition | Purpose |
|---|---|
| `plaid-node` | Plaid API client |
| `resend` | Email sending |
| `react-email` | Email templates |
| `@react-email/components` | Email components |
| Encryption utility | AES-256-GCM for SSN/tokens |

---

## Phase Breakdown Summary

### Phase 1 — Core Lending Infrastructure
- Expand database schema
- Persist platform + encrypted SSN
- Plaid integration (bank linking, income verification)
- Rule-based approval engine with recommendation
- Interest rate calculation (base rate)
- Audit trail
- Email notifications (application lifecycle)
- Compliance pages (Terms, Privacy, Disclosures)
- Admin: audit log page, enhanced detail page

### Phase 2 — Payment & Collections
- Amortization schedule generation at funding
- Plaid Transfer ACH payment collection
- Cron jobs: payment processor, retry, settlement check
- Late fees, warnings, collections escalation
- Borrower status page upgrade (balance, schedule, history)
- Email notifications (payment lifecycle)
- Admin: payment management, collection events

### Phase 3 — Risk Scoring & Optimization
- RiskProfile data collection from completed loans
- Cohort-based risk scoring (lookup, no ML)
- Dynamic interest rate pricing (covers defaults + 25% profit)
- Risk dashboard for admin
- Weekly risk model refresh cron
- Admin: portfolio analytics, risk tier breakdown

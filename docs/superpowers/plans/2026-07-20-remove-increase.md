# Remove Increase (GoACH-Only, Staged) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GoACH the only processor for new money movement, remove Increase origination + the switch + the Increase test harness, add GoACH branches to the three Increase-only paths, and guard every origination so it refuses to charge unless GoACH is pointed at production.

**Architecture:** A `goachProductionReady()` guard fronts every origination path. `getPaymentProcessor()` becomes a constant "goach". The three processor conditionals collapse to GoACH-only. The three Increase-only paths (acceptOffer auto-fund, portal-payoff, portal-skip) get GoACH branches. Increase READ/status code stays for the ~7 in-flight legacy transfers. Increase origination functions + test harness + toggle are deleted last.

**Tech Stack:** Next.js 16, Prisma 7, vitest, GoACH client (src/lib/goach.ts), existing GoACH provisioning (src/lib/goach-provision.ts).

**Spec:** `docs/superpowers/specs/2026-07-20-remove-increase-design.md`.

**Conventions:** commits on main, inline identity + Co-Authored-By Claude, no em dashes, never commit .pl_recipients.json / scripts/pause-notice-send.js. Verify each task: `npx tsc --noEmit` zero, `npm test`, and for UI/route changes `npm run build`.

**MONEY-SAFETY INVARIANTS (hold across every task):**
- No origination path may charge when `goachProductionReady()` is false (staging or unconfigured). It returns the path's error shape and charges nothing.
- The Increase status polls / webhook / refresh / sync stay READ-ONLY and untouched (they clear the 7 in-flight). They already exclude GoACH rows via `processor: {not:"goach"}` / `goachDisburseUuid: null` filters.
- Shared fields (increaseTransferId/increaseTransferStatus/increaseReturnReason on Payment/Application/PaymentAttempt, goachTransactionUuid, goachDisburseUuid) are NOT removed.

**Verified GoACH pattern (the template every origination now uses):**
```typescript
const { goachConfigured, createTransaction } = await import("@/lib/goach");
if (!goachProductionReady()) return <path-error "GoACH production not configured">;
const { ensureGoachBankAccount } = await import("@/lib/goach-provision");
const prov = await ensureGoachBankAccount(applicationId);
if (!prov.ok) return <path-error prov.error>;
const tx = await createTransaction({ bankAccountUuid: prov.bankAccountUuid, amountCents, type: "Debit"|"Credit", descriptor });
if (!tx.ok) return <path-error tx.error>;
// on success store the goach uuid (goachTransactionUuid for debits / goachDisburseUuid for disburse) + shared status fields
```

---

### Task 1: Production guard + constant processor (TDD)

**Files:**
- Modify: `src/lib/payment-processor.ts`
- Test: `src/lib/payment-processor.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// src/lib/payment-processor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tracking/config", () => ({ getTrackingConfig: async () => ({ paymentProcessor: "increase" }) }));
import { goachProductionReady, getPaymentProcessor } from "./payment-processor";

describe("goachProductionReady", () => {
  const OLD = { ...process.env };
  beforeEach(() => { process.env = { ...OLD }; });
  it("false when unconfigured", () => {
    delete process.env.GOACH_API_KEY;
    expect(goachProductionReady()).toBe(false);
  });
  it("false when configured but base url is staging", () => {
    process.env.GOACH_API_KEY = "k"; process.env.GOACH_ORIGINATOR_UUID = "o"; process.env.GOACH_BASE_URL = "https://staging.goach.com/api/v1";
    expect(goachProductionReady()).toBe(false);
  });
  it("true only when configured AND base url is production", () => {
    process.env.GOACH_API_KEY = "k"; process.env.GOACH_ORIGINATOR_UUID = "o"; process.env.GOACH_BASE_URL = "https://login.goach.com/api/v1";
    expect(goachProductionReady()).toBe(true);
  });
});

describe("getPaymentProcessor", () => {
  it("is always goach now", async () => {
    expect(await getPaymentProcessor()).toBe("goach");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/payment-processor.test.ts` -> FAIL.

- [ ] **Step 3: Implement** - add `goachProductionReady`, make `getPaymentProcessor` constant:

```typescript
// src/lib/payment-processor.ts
import "server-only";

export type ProcessorName = "goach";

/** GoACH is the only processor now. Constant kept so existing callers need no change. */
export async function getPaymentProcessor(): Promise<ProcessorName> {
  return "goach";
}

export function goachEnv(): { apiKey: string; baseUrl: string; originatorUuid: string } | null {
  const apiKey = process.env.GOACH_API_KEY;
  const originatorUuid = process.env.GOACH_ORIGINATOR_UUID;
  if (!apiKey || !originatorUuid) return null;
  const baseUrl = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, originatorUuid };
}

/**
 * True only when GoACH is fully configured AND pointed at the production host.
 * Every money-origination path checks this so we can never charge a real
 * borrower against the simulated staging endpoint.
 */
export function goachProductionReady(): boolean {
  const env = goachEnv();
  return !!env && env.baseUrl.includes("login.goach.com");
}
```

Note: `getPaymentProcessor` no longer reads TrackingConfig, so the config-mock in the test is unused but harmless; keep the test's first assertion. Remove any now-unused import of getTrackingConfig from this file.

- [ ] **Step 4:** vitest pass (4 tests); `npm test`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payment-processor.ts src/lib/payment-processor.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "processor: GoACH-only constant plus production-ready guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Collapse the three processor conditionals to GoACH-only + guard

**Files:**
- Modify: `src/lib/plaid-transfer.ts` (initiateACHDebit)
- Modify: `src/actions/applications.ts` (fundApplication)
- Modify: `src/actions/payments.ts` (chargePartialPayment)

READ each function fully first.

- [ ] **Step 1: initiateACHDebit** - it currently has a GoACH `if` branch then an Increase else block. Change so:
  - Replace `const processor = await getPaymentProcessor(); if (processor === "goach") { ...goach... }` with an unconditional GoACH block, and DELETE the Increase else block (ensureIncreaseExternalAccount + safeDebit) entirely.
  - Add the guard at the top of the GoACH block: `const { goachProductionReady } = await import("@/lib/payment-processor"); if (!goachProductionReady()) return { success: false, error: "GoACH production not configured" };`
  - The GoACH block otherwise stays (ensureGoachBankAccount + createTransaction Debit "PENNYLIME PMT" + return {success:true, transferId: tx.uuid, processor:"goach"}).
  - Remove the now-unused `safeDebit` import if it was static.

- [ ] **Step 2: fundApplication** - remove the `else` Increase disburse block (ensureIncreaseExternalAccount + safeDisburse + the INCREASE_API_KEY guard). Keep only the GoACH branch, made unconditional, with the production guard at its top (`if (!goachProductionReady()) { await prisma.application.update({where:{id:applicationId}, data:{increaseDisburseError:"GoACH production not configured"}}); return { success:false, error:"GoACH production not configured" }; }`). The shared post-disburse tail (schedule/FUNDED/audit/email) still runs. Remove the `let transferId/transferStatus` scaffolding only if it becomes unused; keep whatever the shared tail consumes.

- [ ] **Step 3: chargePartialPayment** - remove the `else` Increase block (ensureIncreaseExternalAccount + safeDebit). Keep only the GoACH branch, unconditional, with the production guard at top (revert PROCESSING->PENDING and return {success:false,error:"GoACH production not configured"} when not ready). Preserve the outstanding-amount validation, PROCESSING lock, and the post-charge try/catch writeback.

- [ ] **Step 4: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid-transfer.ts src/actions/applications.ts src/actions/payments.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "processor: collapse debit/disburse/custom-charge to GoACH-only, guarded

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Add GoACH branches to the three Increase-only paths

**Files:**
- Modify: `src/actions/offers.ts` (acceptOffer auto-fund block ~682-813)
- Modify: `src/actions/portal-payoff.ts`
- Modify: `src/actions/portal-skip.ts`

READ each block fully. Each currently does ensureIncreaseExternalAccount + safeDisburse/safeDebit with no GoACH path. Replace the Increase money call with the GoACH template (guarded), preserving all surrounding logic (schedule creation, status writes, audit, notifications, the function's return shape).

- [ ] **Step 1: acceptOffer auto-fund** (src/actions/offers.ts) - this disburses on offer acceptance. Replace the Increase disbursement (createExternalAccount/safeDisburse) with: guard `goachProductionReady()` (on failure, do NOT fund - leave the offer accepted-but-unfunded exactly as the Increase path does on its failure, writing increaseDisburseError and continuing without marking funded); else ensureGoachBankAccount + createTransaction Credit "PENNYLIME ADV"; on success write the Application funded fields including `goachDisburseUuid: tx.uuid` and the shared increaseTransferId/status. Keep the schedule + notifications tail intact. If this block is large, mirror exactly what fundApplication's GoACH branch does.

- [ ] **Step 2: portal-payoff** (src/actions/portal-payoff.ts) - the early-payoff debit. Replace ensureIncreaseExternalAccount + safeDebit with: guard; ensureGoachBankAccount; createTransaction Debit "PENNYLIME PAYOFF"; on success store the returned uuid where the Increase path stored its transferId (increaseTransferId=uuid + goachTransactionUuid if it writes a Payment row; follow the existing write). Preserve payoff amount computation, PROCESSING locks, and return shape.

- [ ] **Step 3: portal-skip** (src/actions/portal-skip.ts) - the skip-payment debit/fee. Same transformation: guard; ensureGoachBankAccount; createTransaction Debit (keep the existing descriptor or "PENNYLIME SKIP"); preserve surrounding logic and return shape.

- [ ] **Step 4: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/offers.ts src/actions/portal-payoff.ts src/actions/portal-skip.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: route auto-fund, payoff and skip through GoACH, guarded

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Remove the processor toggle UI + the Increase test harness

**Files:**
- Modify: `src/actions/tracking.ts` (drop "paymentProcessor" from ALLOWED_FIELDS + the goach-config guard block that references it)
- Modify: `src/app/admin/settings/tracking/tracking-client.tsx` (remove the Payment processor card + the paymentProcessor prop) and `src/app/admin/settings/tracking/page.tsx` (stop computing/passing goachConfigured for that card)
- Delete: `src/actions/increase-test.ts`, `src/app/admin/increase-test/page.tsx`, `src/app/admin/increase-test/client.tsx`
- Modify: `src/middleware.ts` (remove "/admin/increase-test" from ADMIN_PROTECTED)
- Modify: `src/components/admin/top-nav.tsx` (remove the "Increase test" subnav item + its prefix)

- [ ] **Step 1:** Remove the paymentProcessor toggle: delete the "Payment processor" Card from tracking-client.tsx and its `paymentProcessor`/`goachConfigured` prop wiring in the client + page; remove "paymentProcessor" from ALLOWED_FIELDS in tracking.ts and delete the `if (data.paymentProcessor === "goach") {...}` guard block there. Keep the GoACH TEST page (/admin/goach-test) untouched - it stays.

- [ ] **Step 2:** Delete the increase-test files (action + page + client dir). Remove "/admin/increase-test" from middleware ADMIN_PROTECTED. Remove the `{ href: "/admin/increase-test", label: "Increase test" }` subnav entry and the "/admin/increase-test" prefix from the Loan Portal tab in top-nav.tsx.

- [ ] **Step 3:** In submitApplication's best-effort post-submit pipeline (src/actions/applications.ts ~142-156), remove the `ensureIncreaseExternalAccount(application.id)` call from the Promise.allSettled (it pre-creates an Increase external account on every submit - no longer wanted). Leave the other pipeline calls (income, asset report, sanctions) intact.

- [ ] **Step 4:** Relabel the payment-schedule-card "Sync from Increase" button + "Syncing with Increase..." text to processor-neutral "Sync status" / "Syncing..." (src/components/admin/payment-schedule-card.tsx). Keep the underlying sync (it clears in-flight legacy rows).

- [ ] **Step 5: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build` (confirms no dangling imports to deleted files).

- [ ] **Step 6: Commit**

```bash
git add -A src/actions/tracking.ts src/app/admin/settings/tracking src/middleware.ts src/components/admin/top-nav.tsx src/actions/applications.ts src/components/admin/payment-schedule-card.tsx
git rm -r src/actions/increase-test.ts src/app/admin/increase-test
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "remove: increase test harness and the processor toggle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete unused Increase origination functions

**Files:**
- Modify: `src/lib/increase.ts`
- Modify: `src/actions/plaid.ts` (only if ensureIncreaseExternalAccount is now unreferenced)

- [ ] **Step 1: Confirm zero references** - grep for each origination function BEFORE deleting:
```bash
grep -rn "safeDebit\|safeDisburse\|createAchCredit\|createAchDebit\|createRtpTransfer\|createExternalAccount" src | grep -v "src/lib/increase.ts"
```
Every hit must be gone (Tasks 2-4 removed them). If any remain, STOP and report - do not delete a still-referenced function.

- [ ] **Step 2: Delete the origination functions** from src/lib/increase.ts: createAchDebit, createAchCredit, createRtpTransfer, safeDebit, safeDisburse, createExternalAccount. KEEP the read functions the status sync uses: getAchTransfer, getRtpTransfer, getAccount, listAccountNumbers, listAchTransfers, and the auth/header helper + INCREASE_API_KEY/INCREASE_ACCOUNT_ID reads those need. Do not touch the webhook, cron polls, refresh-payment-status, sync-increase-status, audit-stale-returns.

- [ ] **Step 3: ensureIncreaseExternalAccount** - grep its references:
```bash
grep -rn "ensureIncreaseExternalAccount" src
```
If zero remain (Tasks 2-4 + Task 4 Step 3 removed them all), delete the function from src/actions/plaid.ts BUT keep `getPlaidAchNumbers` (GoACH provisioning uses it). If any references remain, leave the function in place and report which.

- [ ] **Step 4: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/increase.ts src/actions/plaid.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "remove: increase origination functions (read-only status sync retained)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Final review + deploy (guard-blocked, staging)

- [ ] **Step 1:** `npm test`; `npx tsc --noEmit`; `npm run build` all green.
- [ ] **Step 2:** Final whole-feature money-safety review (controller dispatches): every origination path (initiateACHDebit + its 4 callers, chargePartialPayment, fundApplication, acceptOffer auto-fund, portal-payoff, portal-skip) is GoACH-only AND guarded by goachProductionReady, so with the current staging env NOTHING can originate real money and nothing fake-charges; the Increase read-only status sync (cron polls, webhook, refresh, sync, audit-stale-returns) is intact and still updates the 7 in-flight legacy rows; no dangling references to deleted Increase functions; shared fields untouched.
- [ ] **Step 3:** Deploy: `git push origin main`; watch Railway to SUCCESS. GoACH env stays STAGING, so origination is guard-blocked (collections paused as intended) and the in-flight 7 keep syncing.
- [ ] **Step 4:** Post-deploy: when the GoACH production key arrives, set GOACH_BASE_URL=https://login.goach.com/api/v1 + the prod key + prod originator uuid on Railway; goachProductionReady flips true and all origination resumes on GoACH. A LATER follow-up removes the Increase read code + INCREASE_* env once the in-flight 7 are all terminal.

---

## Self-review notes
- Spec coverage: guard + constant (T1), collapse 3 conditionals (T2), add 3 GoACH branches (T3), remove toggle + test harness + submit pipeline call + relabel (T4), delete origination functions (T5), review + deploy (T6).
- Ordering is safe: callers of Increase origination are all removed (T2-T4) before the functions are deleted (T5); T5 Step 1/3 grep-guards against deleting anything still referenced.
- The guard is the invariant: no path charges when not production-ready. Deploying on staging pauses collections by design (accepted).
- Kept read-only: cron Increase polls (already exclude goach rows), webhook, refresh-payment-status Increase branch, sync-increase-status, audit-stale-returns, getAchTransfer et al.

# GoACH Payment Processor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GoACH as an alternate ACH processor behind PennyLime's existing money layer, selectable by a config switch, so debits and credits can move from Increase to GoACH with no changes above the money layer.

**Architecture:** A `paymentProcessor` config field routes `initiateACHDebit`, the custom-amount charge, and `fundApplication` to either the existing Increase path or a new GoACH client (`src/lib/goach.ts`). GoACH identifiers live in new distinct DB fields so both processors coexist; the status cron gains a GoACH branch fed by GoACH's `daily_update` cursor feed and reuses the existing application-status cascade. Everything is built and tested against GoACH staging; production flips per-direction later.

**Tech Stack:** Next.js 16, Prisma 7 (Postgres), vitest, GoACH REST API (form-encoded, Bearer auth).

**Spec:** `docs/superpowers/specs/2026-07-16-goach-processor-design.md`. Verified API artifact: `docs/integrations/goach-openapi.json`.

**Conventions:** commits on main with inline identity (`git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit ...`) + Co-Authored-By Claude line; no em dashes; never commit `.pl_recipients.json` / `scripts/pause-notice-send.js`; verify with `npx tsc --noEmit` (zero) and `npm test`.

**MIGRATION RULE (this repo):** prod DB has drift; NEVER `prisma migrate dev`, NEVER accept a reset. Pattern: edit schema, hand-write an additive-only migration folder (timestamp style like siblings), `npx prisma migrate deploy`, `npx prisma generate`.

**Verified integration facts:**
- `initiateACHDebit(paymentId): Promise<{success:true,transferId}|{success:false,error}>` (src/lib/plaid-transfer.ts). Computes `amountCents = round((amount + lateFee) * 100)`, requires `application.plaidAccessToken`.
- Debit callers (all write `{achTransferId, increaseTransferId, increaseTransferStatus:"pending_submission"}` then `recordAttemptStart`): payment-processor cron (route.ts:47), payment-retry cron (route.ts:60), `retryPayment` (payments.ts:94), `chargePaymentNow` (payments.ts:156).
- `chargePartialPayment` (payments.ts ~205) calls `ensureIncreaseExternalAccount` + `safeDebit` DIRECTLY (not via initiateACHDebit) and writes `increaseTransferId` (payments.ts:274).
- Disburse: `fundApplication(applicationId, fundedAmount)` (src/actions/applications.ts:512) calls `ensureIncreaseExternalAccount` then `safeDisburse`, writes Application `{status:"FUNDED", fundedAt, fundedAmount, increaseTransferId, increaseTransferStatus, increaseDisburseError:null}`.
- `ensureIncreaseExternalAccount(applicationId): {ok:true,externalAccountId}|{ok:false,error}` (src/actions/plaid.ts) reads Plaid Auth routing/account.
- Status cron: src/app/api/cron/payment-status/route.ts polls Increase, maps to Payment status, calls `updateAttemptStatus({transferId,...})` (keys on `PaymentAttempt.increaseTransferId`) and `refreshApplicationStatusFromPayments(appId)`.
- `explainReturnCode(code): string|null` (src/lib/ach-return-codes.ts) -> "Insufficient funds (R01)".
- `recordAttemptStart({paymentId, initiatedBy, amount, transferId, transferStatus?})`, `updateAttemptStatus({transferId, transferStatus, finalStatus?, settledAt?, returnReason?})` (src/lib/payment-attempts.ts).
- Config singleton: `getTrackingConfig()` / `updateTrackingConfig(data)` (src/lib/tracking/config.ts).
- GoACH: base `https://staging.goach.com/api/v1/` (prod `https://login.goach.com/api/v1/`), header `Authorization: Bearer <key>`, envelope `{data,errors,status,details:{new_pointer,...}}`. Create tx `POST /ach_transactions` (form: originator_ach_account_id, bank_account_id, amount, transaction_type, descriptor?, poa_file?) -> data has `uuid, transaction_id, current_status`. `POST /ach_transactions/{uuid}/cancel`. `GET /ach_transactions/{uuid}`. `GET /ach_transactions/daily_update` -> `data:[{ach_transaction_uuid, uuid, updates:{current_status:[from,to]}}]` + `details.new_pointer`. `POST /receivers` (name...), `POST /bank_accounts` (name, receiver_id, routing_number, account_number, business, checking). Staging originator uuid: `8c1cfc35-70fe-4fc5-b0e3-db51325df890`.

---

### Task 1: Schema + config accessors

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260716120000_add_goach_processor/migration.sql`
- Create: `src/lib/payment-processor.ts`

- [ ] **Step 1: Schema fields**

Add to `model Payment`: `processor String?` and `goachTransactionUuid String? @unique` (near `increaseTransferId`). Add to `model Application`: `goachReceiverUuid String?`, `goachBankAccountUuid String?`, `goachDisburseUuid String?` (near `increaseTransferId`). Add to `model TrackingConfig`: `paymentProcessor String @default("increase")` and `goachDailyUpdatePointer String?`.

- [ ] **Step 2: Hand-write the migration**

`prisma/migrations/20260716120000_add_goach_processor/migration.sql` (additive only; mirror the style of `20260703000000_add_call_log_and_voice_config/migration.sql`):

```sql
ALTER TABLE "Payment" ADD COLUMN "processor" TEXT;
ALTER TABLE "Payment" ADD COLUMN "goachTransactionUuid" TEXT;
ALTER TABLE "Application" ADD COLUMN "goachReceiverUuid" TEXT;
ALTER TABLE "Application" ADD COLUMN "goachBankAccountUuid" TEXT;
ALTER TABLE "Application" ADD COLUMN "goachDisburseUuid" TEXT;
ALTER TABLE "TrackingConfig" ADD COLUMN "paymentProcessor" TEXT NOT NULL DEFAULT 'increase';
ALTER TABLE "TrackingConfig" ADD COLUMN "goachDailyUpdatePointer" TEXT;
CREATE UNIQUE INDEX "Payment_goachTransactionUuid_key" ON "Payment"("goachTransactionUuid");
```

- [ ] **Step 3: Apply** `npx prisma migrate deploy` then `npx prisma generate`. NEVER migrate dev.

- [ ] **Step 4: Config accessor**

```typescript
// src/lib/payment-processor.ts
import "server-only";
import { getTrackingConfig } from "@/lib/tracking/config";

export type ProcessorName = "increase" | "goach";

/** Which processor NEW transactions should use. Defaults to increase. */
export async function getPaymentProcessor(): Promise<ProcessorName> {
  const cfg = await getTrackingConfig();
  return cfg.paymentProcessor === "goach" ? "goach" : "increase";
}

export function goachEnv(): { apiKey: string; baseUrl: string; originatorUuid: string } | null {
  const apiKey = process.env.GOACH_API_KEY;
  const originatorUuid = process.env.GOACH_ORIGINATOR_UUID;
  if (!apiKey || !originatorUuid) return null;
  const baseUrl = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, originatorUuid };
}
```

- [ ] **Step 5: Verify** `npx tsc --noEmit` zero; `npm test`; `npx prisma migrate status` up to date.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/payment-processor.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: schema fields, processor switch and config accessors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: GoACH client + pure status mapper (TDD)

**Files:**
- Create: `src/lib/goach.ts`
- Test: `src/lib/goach.test.ts`

- [ ] **Step 1: Failing tests for the pure helpers**

```typescript
// src/lib/goach.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mapGoachStatus, parseDailyUpdate } from "./goach";

describe("mapGoachStatus", () => {
  it("maps success statuses to PAID", () => {
    for (const s of ["Funded", "Deposited"]) {
      expect(mapGoachStatus(s, null)).toEqual({ paymentStatus: "PAID", isSettled: true, isReturned: false });
    }
  });
  it("maps in-flight statuses to PROCESSING", () => {
    for (const s of ["Pending", "Processed", "Originated"]) {
      expect(mapGoachStatus(s, null).paymentStatus).toBe("PROCESSING");
    }
  });
  it("maps returns and NSF to RETURNED and flags them", () => {
    expect(mapGoachStatus("Returned", "R01")).toEqual({ paymentStatus: "RETURNED", isSettled: false, isReturned: true });
    expect(mapGoachStatus("NSF", null).paymentStatus).toBe("RETURNED");
  });
  it("maps Cancelled and Failed", () => {
    expect(mapGoachStatus("Cancelled", null).paymentStatus).toBe("CANCELED");
    expect(mapGoachStatus("Failed", null).paymentStatus).toBe("FAILED");
  });
  it("unknown status stays PROCESSING (never silently PAID)", () => {
    expect(mapGoachStatus("Weird", null).paymentStatus).toBe("PROCESSING");
  });
});

describe("parseDailyUpdate", () => {
  it("extracts status changes and the cursor", () => {
    const body = {
      data: [
        { ach_transaction_uuid: "tx-1", uuid: "c-1", updates: { current_status: ["Processed", "Funded"] } },
        { ach_transaction_uuid: "tx-2", uuid: "c-2", updates: { current_status: ["Processed", "Returned"] } },
        { ach_transaction_uuid: "tx-3", uuid: "c-3", updates: { amount: ["1", "2"] } },
      ],
      details: { new_pointer: "c-3", remaining_count: 0 },
    };
    const out = parseDailyUpdate(body);
    expect(out.changes).toEqual([
      { transactionUuid: "tx-1", from: "Processed", to: "Funded" },
      { transactionUuid: "tx-2", from: "Processed", to: "Returned" },
    ]);
    expect(out.newPointer).toBe("c-3");
    expect(out.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/goach.test.ts` -> FAIL (module missing).

- [ ] **Step 3: Implement the client**

```typescript
// src/lib/goach.ts
import "server-only";
import { readFile } from "node:fs/promises";
import { goachEnv } from "@/lib/payment-processor";

export type GoachStatusMap = {
  paymentStatus: "PROCESSING" | "PAID" | "RETURNED" | "FAILED" | "CANCELED";
  isSettled: boolean;
  isReturned: boolean;
};

const SETTLED = new Set(["Funded", "Deposited", "Settled"]);
const RETURNED = new Set(["Returned", "NSF"]);

/** Pure map from a GoACH current_status (+ optional return code) to our Payment status. */
export function mapGoachStatus(current: string, returnCode: string | null | undefined): GoachStatusMap {
  if (SETTLED.has(current)) return { paymentStatus: "PAID", isSettled: true, isReturned: false };
  if (RETURNED.has(current) || (returnCode && returnCode.trim())) {
    return { paymentStatus: "RETURNED", isSettled: false, isReturned: true };
  }
  if (current === "Cancelled" || current === "Canceled") {
    return { paymentStatus: "CANCELED", isSettled: false, isReturned: false };
  }
  if (current === "Failed") return { paymentStatus: "FAILED", isSettled: false, isReturned: false };
  return { paymentStatus: "PROCESSING", isSettled: false, isReturned: false };
}

export type DailyUpdateChange = { transactionUuid: string; from: string; to: string };

/** Pure parser: pull current_status changes and the cursor out of a daily_update body. */
export function parseDailyUpdate(body: unknown): { changes: DailyUpdateChange[]; newPointer: string | null; remaining: number } {
  const b = body as { data?: Array<{ ach_transaction_uuid?: string; updates?: { current_status?: [string, string] } }>; details?: { new_pointer?: string | null; remaining_count?: number } };
  const changes: DailyUpdateChange[] = [];
  for (const row of b.data ?? []) {
    const cs = row.updates?.current_status;
    if (cs && cs.length === 2 && row.ach_transaction_uuid) {
      changes.push({ transactionUuid: row.ach_transaction_uuid, from: cs[0], to: cs[1] });
    }
  }
  return { changes, newPointer: b.details?.new_pointer ?? null, remaining: b.details?.remaining_count ?? 0 };
}

// --- HTTP layer -------------------------------------------------------------

function cfg() {
  const env = goachEnv();
  if (!env) throw new Error("GoACH not configured");
  return env;
}

export function goachConfigured(): boolean {
  return goachEnv() !== null;
}

async function req(method: string, path: string, form?: Record<string, string>, file?: { field: string; path: string }): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { apiKey, baseUrl } = cfg();
  try {
    let body: BodyInit | undefined;
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
    if (file) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form ?? {})) fd.append(k, v);
      const buf = await readFile(file.path);
      fd.append(file.field, new Blob([buf]), file.path.split("/").pop() || "poa");
      body = fd;
    } else if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: unknown; status?: string };
    if (!res.ok || (json.errors && json.status !== "success" && json.status !== "created")) {
      return { ok: false, error: typeof json.errors === "string" ? json.errors : `GoACH ${res.status}` };
    }
    return { ok: true, data: (json.data ?? {}) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GoACH network error" };
  }
}

export async function createReceiver(input: { name: string; email?: string; custom1?: string }): Promise<{ ok: true; uuid: string } | { ok: false; error: string }> {
  const form: Record<string, string> = { name: input.name };
  if (input.email) form.email = input.email;
  if (input.custom1) form.custom_1 = input.custom1;
  const r = await req("POST", "/receivers", form);
  return r.ok ? { ok: true, uuid: String(r.data.uuid) } : r;
}

export async function createBankAccount(input: { name: string; receiverUuid: string; routingNumber: string; accountNumber: string; business: boolean; checking: boolean }): Promise<{ ok: true; uuid: string } | { ok: false; error: string }> {
  const r = await req("POST", "/bank_accounts", {
    name: input.name,
    receiver_id: input.receiverUuid,
    routing_number: input.routingNumber,
    account_number: input.accountNumber,
    business: String(input.business),
    checking: String(input.checking),
  });
  return r.ok ? { ok: true, uuid: String(r.data.uuid) } : r;
}

export async function createTransaction(input: { bankAccountUuid: string; amountCents: number; type: "Debit" | "Credit"; descriptor?: string; poaFilePath?: string }): Promise<{ ok: true; uuid: string; transactionId: string; status: string } | { ok: false; error: string }> {
  const { originatorUuid } = cfg();
  const form: Record<string, string> = {
    originator_ach_account_id: originatorUuid,
    bank_account_id: input.bankAccountUuid,
    amount: (input.amountCents / 100).toFixed(2),
    transaction_type: input.type,
  };
  if (input.descriptor) form.descriptor = input.descriptor;
  const r = await req("POST", "/ach_transactions", form, input.poaFilePath ? { field: "poa_file", path: input.poaFilePath } : undefined);
  return r.ok ? { ok: true, uuid: String(r.data.uuid), transactionId: String(r.data.transaction_id ?? ""), status: String(r.data.current_status ?? "") } : r;
}

export async function getTransaction(uuid: string): Promise<{ ok: true; status: string; returnCode: string | null } | { ok: false; error: string }> {
  const r = await req("GET", `/ach_transactions/${uuid}`);
  return r.ok ? { ok: true, status: String(r.data.current_status ?? ""), returnCode: (r.data.return_code as string) ?? null } : r;
}

export async function cancelTransaction(uuid: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const r = await req("POST", `/ach_transactions/${uuid}/cancel`);
  return r.ok ? { ok: true, status: String(r.data.current_status ?? "") } : r;
}

export async function dailyUpdate(pointer?: string | null): Promise<{ ok: true; changes: DailyUpdateChange[]; newPointer: string | null; remaining: number } | { ok: false; error: string }> {
  const { apiKey, baseUrl } = cfg();
  const url = new URL(`${baseUrl}/ach_transactions/daily_update`);
  if (pointer) url.searchParams.set("pointer", pointer);
  try {
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `GoACH ${res.status}` };
    const parsed = parseDailyUpdate(await res.json());
    return { ok: true, ...parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GoACH network error" };
  }
}
```

NOTE: confirm the daily_update cursor query param name against the live API in Task 7's staging script (it may be `pointer`, `after`, or `new_pointer`); adjust `dailyUpdate` accordingly and re-run the parser test (parser is param-agnostic).

- [ ] **Step 4: Run** `npx vitest run src/lib/goach.test.ts` -> PASS (7 tests). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/goach.ts src/lib/goach.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: API client, status mapper, daily-update parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Receiver/bank provisioning

**Files:**
- Create: `src/lib/goach-provision.ts`

- [ ] **Step 1: Study** `ensureIncreaseExternalAccount` in src/actions/plaid.ts (how it decrypts plaidAccessToken and calls Plaid `authGet` to get routing/account). Reuse the SAME Plaid read.

- [ ] **Step 2: Implement**

```typescript
// src/lib/goach-provision.ts
import "server-only";
import { prisma } from "@/lib/db";
import { createReceiver, createBankAccount } from "@/lib/goach";

/**
 * Ensure the application has a GoACH receiver + bank account, creating them
 * from the Plaid-verified routing/account on first use. Idempotent: cached
 * uuids on the Application are returned without re-creating.
 */
export async function ensureGoachBankAccount(applicationId: string): Promise<
  { ok: true; receiverUuid: string; bankAccountUuid: string } | { ok: false; error: string }
> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, firstName: true, lastName: true, email: true, applicationCode: true, goachReceiverUuid: true, goachBankAccountUuid: true },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (app.goachReceiverUuid && app.goachBankAccountUuid) {
    return { ok: true, receiverUuid: app.goachReceiverUuid, bankAccountUuid: app.goachBankAccountUuid };
  }

  // Reuse the exact Plaid Auth read the Increase path uses.
  const { getPlaidAuthNumbers } = await import("@/actions/plaid");
  const auth = await getPlaidAuthNumbers(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  let receiverUuid = app.goachReceiverUuid;
  if (!receiverUuid) {
    const r = await createReceiver({ name: `${app.firstName} ${app.lastName}`.trim(), email: app.email, custom1: app.applicationCode });
    if (!r.ok) return { ok: false, error: r.error };
    receiverUuid = r.uuid;
    await prisma.application.update({ where: { id: applicationId }, data: { goachReceiverUuid: receiverUuid } });
  }

  const ba = await createBankAccount({
    name: `${app.firstName} ${app.lastName}`.trim().slice(0, 60) || "Borrower",
    receiverUuid,
    routingNumber: auth.routingNumber,
    accountNumber: auth.accountNumber,
    business: false,
    checking: true,
  });
  if (!ba.ok) return { ok: false, error: ba.error };
  await prisma.application.update({ where: { id: applicationId }, data: { goachBankAccountUuid: ba.uuid } });
  return { ok: true, receiverUuid, bankAccountUuid: ba.uuid };
}
```

IMPORTANT: `getPlaidAuthNumbers` may not exist as a named export. READ src/actions/plaid.ts first: if `ensureIncreaseExternalAccount` inlines the Plaid Auth call, extract a small exported helper `getPlaidAuthNumbers(applicationId): Promise<{ok:true, routingNumber, accountNumber}|{ok:false,error}>` from that existing code (refactor, keeping the Increase path calling it too) and use it here. Do not duplicate the Plaid decryption logic.

- [ ] **Step 3: Verify** `npx tsc --noEmit` zero; `npm test`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/goach-provision.ts src/actions/plaid.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: provision receiver and bank account from Plaid auth

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Route the debit path

**Files:**
- Modify: `src/lib/plaid-transfer.ts` (initiateACHDebit branch)
- Create: `src/lib/debit-writeback.ts`
- Modify: `src/app/api/cron/payment-processor/route.ts`, `src/app/api/cron/payment-retry/route.ts`, `src/actions/payments.ts` (chargePaymentNow, retryPayment, chargePartialPayment)

- [ ] **Step 1: initiateACHDebit branch** - after `amountCents` is computed and BEFORE the Increase-specific `ensureIncreaseExternalAccount` block, add:

```typescript
  const { getPaymentProcessor } = await import("@/lib/payment-processor");
  const processor = await getPaymentProcessor();
  if (processor === "goach") {
    const { goachConfigured, createTransaction } = await import("@/lib/goach");
    if (!goachConfigured()) return { success: false, error: "GoACH not configured" };
    const { ensureGoachBankAccount } = await import("@/lib/goach-provision");
    const prov = await ensureGoachBankAccount(payment.applicationId);
    if (!prov.ok) return { success: false, error: prov.error };
    const tx = await createTransaction({ bankAccountUuid: prov.bankAccountUuid, amountCents, type: "Debit", descriptor: "PENNYLIME PMT" });
    if (!tx.ok) return { success: false, error: tx.error };
    return { success: true, transferId: tx.uuid };
  }
  // ... existing Increase path unchanged below
```

The returned `transferId` is the GoACH tx uuid in this branch.

- [ ] **Step 2: Shared write-back helper** - the 4 initiateACHDebit callers currently write `{achTransferId, increaseTransferId, increaseTransferStatus}` identically. Centralize so the GoACH id lands in the right column:

```typescript
// src/lib/debit-writeback.ts
import "server-only";
import { prisma } from "@/lib/db";
import { getPaymentProcessor } from "@/lib/payment-processor";

/**
 * Persist a freshly-initiated debit's transfer id onto the Payment in the
 * processor-correct columns. transferId is the Increase transfer id or the
 * GoACH transaction uuid depending on the active processor. increaseTransferId
 * is ALSO set (it is the lookup key PaymentAttempt uses for both processors).
 */
export async function applyDebitInitiation(paymentId: string, transferId: string): Promise<void> {
  const processor = await getPaymentProcessor();
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      processor,
      achTransferId: transferId,
      increaseTransferId: transferId,
      increaseTransferStatus: "pending_submission",
      ...(processor === "goach" ? { goachTransactionUuid: transferId } : {}),
    },
  });
}
```

- [ ] **Step 3: Swap the 4 callers' write-back block** - in payment-processor cron, payment-retry cron, `chargePaymentNow`, `retryPayment`, replace the `await prisma.payment.update({ where..., data: { achTransferId: result.transferId, increaseTransferId: result.transferId, increaseTransferStatus: "pending_submission" } })` block with:

```typescript
      const { applyDebitInitiation } = await import("@/lib/debit-writeback");
      await applyDebitInitiation(payment.id, result.transferId);
```

(use `paymentId` where the local is named that). Leave each caller's failure handling, `recordAttemptStart`, and `logAudit` exactly as-is.

- [ ] **Step 4: chargePartialPayment** (payments.ts ~205) — it calls Increase directly. Add a GoACH branch mirroring Step 1 at the top of its charge logic: when `getPaymentProcessor()==="goach"`, use `ensureGoachBankAccount` + `createTransaction({type:"Debit", descriptor:"PENNYLIME COLLECT"})`, then on success write `processor:"goach"`, `goachTransactionUuid`, `increaseTransferId` (=uuid) + `recordAttemptStart(transferId=uuid)`; else keep the existing Increase path. Read the function fully and preserve its outstanding-amount validation and PROCESSING lock.

- [ ] **Step 5: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plaid-transfer.ts src/lib/debit-writeback.ts src/app/api/cron/payment-processor/route.ts src/app/api/cron/payment-retry/route.ts src/actions/payments.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: route debits and custom charges through the processor switch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Route the disburse path

**Files:**
- Modify: `src/actions/applications.ts` (fundApplication)

- [ ] **Step 1: Branch fundApplication** - READ fundApplication fully (src/actions/applications.ts:512). After the APPROVED-status guard and amount computation, before the `ensureIncreaseExternalAccount` + `safeDisburse` block, add:

```typescript
  const { getPaymentProcessor } = await import("@/lib/payment-processor");
  if ((await getPaymentProcessor()) === "goach") {
    const { goachConfigured, createTransaction } = await import("@/lib/goach");
    if (!goachConfigured()) return { success: false, error: "GoACH not configured" };
    const { ensureGoachBankAccount } = await import("@/lib/goach-provision");
    const prov = await ensureGoachBankAccount(applicationId);
    if (!prov.ok) {
      await prisma.application.update({ where: { id: applicationId }, data: { increaseDisburseError: prov.error } });
      return { success: false, error: prov.error };
    }
    const amountCents = Math.round(fundedAmount * 100);
    const tx = await createTransaction({ bankAccountUuid: prov.bankAccountUuid, amountCents, type: "Credit", descriptor: "PENNYLIME ADVANCE" });
    if (!tx.ok) {
      await prisma.application.update({ where: { id: applicationId }, data: { increaseDisburseError: tx.error } });
      return { success: false, error: tx.error };
    }
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "FUNDED", fundedAt: new Date(), fundedAmount, goachDisburseUuid: tx.uuid, increaseDisburseError: null },
    });
    // (leave the existing schedule-generation + audit code that runs AFTER disbursement to run for both paths)
    // ... continue to the shared post-disburse logic
    return { success: true };
  }
  // ... existing Increase disburse path unchanged
```

CAUTION: fundApplication also generates the payment schedule and logs audit AFTER a successful disburse. Structure the GoACH branch so that shared post-disburse work (schedule creation, audit, notifications) still runs. The cleanest shape: compute a `disbursed` result (`{transferId, statusField}`) from whichever processor, do ONE Application update, then run the shared schedule/audit tail once. If the function is large, refactor minimally to a single disburse-then-tail flow rather than duplicating the tail. Preserve the exact return shape (`{success:true}` / `{success:false,error}`).

- [ ] **Step 2: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/applications.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: route disbursements through the processor switch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Status sync (GoACH branch in the cron)

**Files:**
- Modify: `src/app/api/cron/payment-status/route.ts`
- Modify: `src/actions/refresh-payment-status.ts` (single-payment admin refresh, if it exists; else skip)

- [ ] **Step 1: Add a GoACH sync pass** - READ payment-status route fully. Add, before or after the Increase repayment poll, a GoACH pass:

```typescript
  // --- GoACH status sync via the daily_update cursor feed ---
  {
    const { goachConfigured, dailyUpdate, mapGoachStatus, getTransaction } = await import("@/lib/goach");
    if (goachConfigured()) {
      const { getTrackingConfig, updateTrackingConfig } = await import("@/lib/tracking/config");
      const { explainReturnCode } = await import("@/lib/ach-return-codes");
      const { updateAttemptStatus } = await import("@/lib/payment-attempts");
      const cfg = await getTrackingConfig();
      let pointer = cfg.goachDailyUpdatePointer;
      let guard = 0;
      const touchedApps = new Set<string>();
      while (guard++ < 50) {
        const upd = await dailyUpdate(pointer);
        if (!upd.ok || upd.changes.length === 0) break;
        for (const ch of upd.changes) {
          const payment = await prisma.payment.findUnique({ where: { goachTransactionUuid: ch.transactionUuid }, select: { id: true, applicationId: true, paidAt: true } });
          const target = ch.to;
          if (payment) {
            // Fetch the return code when the change is a return.
            let returnCode: string | null = null;
            if (mapGoachStatus(target, null).isReturned) {
              const t = await getTransaction(ch.transactionUuid);
              if (t.ok) returnCode = t.returnCode;
            }
            const mapped = mapGoachStatus(target, returnCode);
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                increaseTransferStatus: target,
                status: mapped.paymentStatus,
                paidAt: mapped.isSettled ? new Date() : payment.paidAt,
                increaseReturnReason: returnCode ? explainReturnCode(returnCode) : undefined,
              },
            });
            await updateAttemptStatus({
              transferId: ch.transactionUuid,
              transferStatus: target,
              finalStatus: mapped.isSettled ? "PAID" : mapped.isReturned ? "RETURNED" : mapped.paymentStatus === "FAILED" ? "FAILED" : undefined,
              settledAt: mapped.isSettled ? new Date() : undefined,
              returnReason: returnCode ? explainReturnCode(returnCode) : undefined,
            });
            touchedApps.add(payment.applicationId);
          } else {
            // Disbursement credit change: match Application by goachDisburseUuid.
            const appRow = await prisma.application.findFirst({ where: { goachDisburseUuid: ch.transactionUuid }, select: { id: true, status: true } });
            if (appRow) {
              await prisma.application.update({ where: { id: appRow.id }, data: { increaseTransferStatus: target } });
              touchedApps.add(appRow.id);
            }
          }
        }
        pointer = upd.newPointer;
        await updateTrackingConfig({ goachDailyUpdatePointer: pointer });
        if (upd.remaining === 0) break;
      }
      const { refreshApplicationStatusFromPayments } = await import("./route-helpers-or-inline");
      for (const appId of touchedApps) await refreshApplicationStatusFromPayments(appId);
    }
  }
```

Adapt the final `refreshApplicationStatusFromPayments` import to however it is defined/exported in this file today (it is currently an in-file function in payment-status/route.ts; call it directly, do not invent a module). Keep the existing Increase branches untouched.

- [ ] **Step 2: Single-payment admin refresh** - if `src/actions/refresh-payment-status.ts` exists and is used by the dialer money panel "Refresh", add a GoACH branch: when the payment has `goachTransactionUuid`, call `getTransaction` + `mapGoachStatus` and write the same fields; else keep Increase. If the file does not exist, skip this step.

- [ ] **Step 3: Verify** `npx tsc --noEmit` zero; `npm test`; `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/payment-status/route.ts src/actions/refresh-payment-status.ts 2>/dev/null || git add src/app/api/cron/payment-status/route.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: status sync via daily-update cursor into the app cascade

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin toggle + staging integration script + verify

**Files:**
- Modify: `src/actions/tracking.ts` (allow paymentProcessor in the save allowlist), `src/app/admin/settings/tracking/tracking-client.tsx` (a processor selector)
- Create: `scripts/goach-smoke.mjs`

- [ ] **Step 1: Admin toggle** - add `"paymentProcessor"` to the ALLOWED_FIELDS array in src/actions/tracking.ts, and in tracking-client.tsx add a small card "Payment processor" with a select (Increase / GoACH) bound to `config.paymentProcessor` (extend the config prop type). Follow the exact Card/Field pattern already in that file. This is the reversible switch.

- [ ] **Step 2: Staging smoke script**

```javascript
// scripts/goach-smoke.mjs
// End-to-end GoACH staging check. Usage:
//   GOACH_API_KEY=... GOACH_ORIGINATOR_UUID=... GOACH_BASE_URL=https://staging.goach.com/api/v1 node scripts/goach-smoke.mjs
const KEY = process.env.GOACH_API_KEY;
const ORIG = process.env.GOACH_ORIGINATOR_UUID;
const BASE = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
if (!KEY || !ORIG) { console.error("set GOACH_API_KEY and GOACH_ORIGINATOR_UUID"); process.exit(1); }
const H = { Authorization: `Bearer ${KEY}`, Accept: "application/json" };
const form = (o) => new URLSearchParams(o).toString();
async function post(p, o) { const r = await fetch(BASE + p, { method: "POST", headers: { ...H, "Content-Type": "application/x-www-form-urlencoded" }, body: form(o) }); return r.json(); }
async function get(p) { const r = await fetch(BASE + p, { headers: H }); return r.json(); }

const rcv = await post("/receivers", { name: "Smoke Test", email: "smoke@example.com", custom_1: "SMOKE-1" });
console.log("receiver:", rcv.data?.uuid);
const ba = await post("/bank_accounts", { name: "Smoke Checking", receiver_id: rcv.data.uuid, routing_number: "021000021", account_number: "123456789", business: "false", checking: "true" });
console.log("bank:", ba.data?.uuid);
const tx = await post("/ach_transactions", { originator_ach_account_id: ORIG, bank_account_id: ba.data.uuid, amount: "1.00", transaction_type: "Debit", descriptor: "SMOKE PMT" });
console.log("tx:", tx.data?.uuid, tx.data?.current_status, tx.data?.transaction_id);
const back = await get(`/ach_transactions/${tx.data.uuid}`);
console.log("readback status:", back.data?.current_status);
const du = await get("/ach_transactions/daily_update");
console.log("daily_update sample:", JSON.stringify(du.data?.slice(0, 2)), "pointer:", du.details?.new_pointer);
const cx = await post(`/ach_transactions/${tx.data.uuid}/cancel`, {});
console.log("cancel:", cx.data?.current_status);
```

- [ ] **Step 3: Run the smoke script** with the staging key to CONFIRM the `daily_update` cursor param name and the create/cancel round-trip:

```bash
GOACH_API_KEY="NtvmdvHJhyAa25FNKBn2tLjYbG4ykAqcELrrKxFI2qAt" GOACH_ORIGINATOR_UUID="8c1cfc35-70fe-4fc5-b0e3-db51325df890" GOACH_BASE_URL="https://staging.goach.com/api/v1" node scripts/goach-smoke.mjs
```

Expected: prints receiver/bank/tx uuids, status transitions, a daily_update sample with a `new_pointer`, and a `Cancelled` status. If the daily_update cursor needs a query param to advance, note it and fix `dailyUpdate` in src/lib/goach.ts (Task 2), then re-run.

- [ ] **Step 4: Full verify** `npm test`; `npx tsc --noEmit`; `npm run build` all green.

- [ ] **Step 5: Commit**

```bash
git add src/actions/tracking.ts src/app/admin/settings/tracking/tracking-client.tsx scripts/goach-smoke.mjs
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "goach: admin processor toggle and staging smoke script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Final review + deploy (default stays Increase)

- [ ] **Step 1:** `npm test`; `npx tsc --noEmit`; `npm run build` all green.
- [ ] **Step 2:** Final whole-feature review (controller dispatches it), focused on: money cannot route to GoACH unless BOTH the config switch is "goach" AND env is configured; in-flight Increase transfers keep syncing after a switch; no caller writes the wrong id column; the disburse tail (schedule/audit) runs for both processors.
- [ ] **Step 3:** Deploy: set `GOACH_API_KEY`, `GOACH_ORIGINATOR_UUID`, `GOACH_BASE_URL=https://staging.goach.com/api/v1` on Railway (staging values, safe: switch still defaults to increase). `git push origin main`; watch Railway to SUCCESS. Because `paymentProcessor` defaults to "increase", production behavior is unchanged.
- [ ] **Step 4:** Staging validation (Bar/controller): in a non-prod context flip `paymentProcessor` to "goach", charge a test payment, watch it originate on GoACH and sync back via the cron; then flip back to "increase" and confirm Increase still charges. Do NOT flip prod to GoACH until GoACH issues a production key and enables credit origination.

---

## Self-review notes

- Spec coverage: config+schema (T1), client+mapper+parser (T2), provisioning (T3), debit routing incl. custom charge (T4), disburse routing (T5), status sync (T6), admin toggle + staging script (T7), review+deploy (T8).
- Distinct GoACH id fields (goachTransactionUuid on Payment, goachDisburseUuid on Application) keep processors separate; PaymentAttempt reuses increaseTransferId as a neutral lookup key set from the returned uuid (documented in applyDebitInitiation and recordAttemptStart calls).
- mapGoachStatus never returns PAID for unknown statuses (money-safety); returns flagged via return code OR Returned/NSF status.
- Rollout safety: default "increase", per-payment `processor` stored so a mid-flight switch never strands in-flight transfers.
- Open confirmations flagged for the staging script: daily_update cursor param name; POA threshold with GoACH (attachment support is built; automatic large-tx attachment is a follow-up).

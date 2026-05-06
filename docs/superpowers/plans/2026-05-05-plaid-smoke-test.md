# Plaid Smoke-Test Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only `/admin/plaid-test` page that runs the existing Plaid pipeline (link → income/balance → Increase external account) end-to-end against a fixed seeded test application, with one click and clear pass/fail state for each step.

**Architecture:** A single new admin page renders a client component that orchestrates Plaid Link via `react-plaid-link`, then chains existing server actions (`fetchAndStoreIncome`, `ensureIncreaseExternalAccount`) plus a few new test-only server actions for persistence, debug dumps, and reset. A new dedicated seed script creates one fixed test application with known ID, run as part of the existing Railway build chain so each deploy starts clean.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 (better-sqlite3 adapter), `plaid` v41 SDK, `react-plaid-link`, next-auth (existing middleware-based admin gate).

**Spec:** `docs/superpowers/specs/2026-05-05-plaid-smoke-test-design.md`

**No automated tests for this feature.** Per spec, this IS the smoke test. Verification = manual click-through against `pennylime.com` after Railway deploy. Each task uses `npx tsc --noEmit` for compile-check and either local `npm run dev` or final Railway deploy for runtime check.

---

## Constants used across tasks

```ts
// Fixed test application identifier (chosen for clarity, not random)
export const PLAID_TEST_APP_ID = "plaid-smoke-test";
```

---

## File structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `scripts/seed-plaid-test-app.ts` | create | Seeds the fixed test Application row, idempotent (upsert) |
| `package.json` | modify | Chain new seed script in `build` script |
| `src/middleware.ts` | modify | Add `/admin/plaid-test` to `ADMIN_PROTECTED` |
| `src/components/admin/top-nav.tsx` | modify | Add "Plaid test" sub-item under Loan Portal section |
| `src/actions/plaid-test.ts` | create | New test-only server actions: `getPlaidTestAppState`, `persistPlaidLinkToTestApp`, `getPlaidDebugDump`, `resetTestApp` |
| `src/app/admin/plaid-test/page.tsx` | create | Server component, fetches initial test app state, hydrates client component |
| `src/app/admin/plaid-test/client.tsx` | create | Client component with `usePlaidLink`, pipeline orchestration, status panel, reset, debug panel |

No schema changes. No changes to existing `/api/plaid/*` routes or existing `src/actions/plaid.ts`.

---

## Task 1: Seed the fixed test application

**Files:**
- Create: `scripts/seed-plaid-test-app.ts`
- Modify: `package.json` (build script)

- [ ] **Step 1: Create the seed script**

Create `scripts/seed-plaid-test-app.ts`:

```ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

export const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function main() {
  await prisma.application.upsert({
    where: { id: PLAID_TEST_APP_ID },
    update: {
      // Reset Plaid + downstream fields on every deploy so smoke test starts clean
      plaidAccessToken: null,
      plaidAccountId: null,
      plaidItemId: null,
      plaidLinkStale: false,
      monthlyIncome: null,
      bankBalance: null,
      increaseTransferId: null,
      increaseTransferStatus: null,
      increaseDisburseError: null,
    },
    create: {
      id: PLAID_TEST_APP_ID,
      applicationCode: "PLAID-TEST",
      firstName: "Plaid",
      lastName: "Sandbox",
      email: "plaid-smoke-test@pennylime.com",
      phone: "(555) 555-0100",
      loanAmount: 1000,
      loanTermMonths: 6,
      platform: "Uber",
      status: "PENDING",
    },
  });
  console.log(`Seeded Plaid smoke-test application: ${PLAID_TEST_APP_ID}`);
}

main()
  .catch((err) => {
    console.error("Failed to seed Plaid test app:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Chain the seed into the build script**

Edit `package.json`. Find the `build` script:

```json
"build": "prisma generate && prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx scripts/seed-content.ts && npx tsx scripts/seed-landing-pages.ts && npx tsx scripts/seed-form-templates.ts && npx tsx scripts/seed-email-sequences.ts && npx tsx scripts/seed-demo-data.ts && next build",
```

Add `npx tsx scripts/seed-plaid-test-app.ts &&` immediately before `next build`:

```json
"build": "prisma generate && prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx scripts/seed-content.ts && npx tsx scripts/seed-landing-pages.ts && npx tsx scripts/seed-form-templates.ts && npx tsx scripts/seed-email-sequences.ts && npx tsx scripts/seed-demo-data.ts && npx tsx scripts/seed-plaid-test-app.ts && next build",
```

- [ ] **Step 3: Run the seed locally to verify it works**

Run: `cd ~/pennylime && npx tsx scripts/seed-plaid-test-app.ts`
Expected output: `Seeded Plaid smoke-test application: plaid-smoke-test`

- [ ] **Step 4: Verify the row exists**

Run: `cd ~/pennylime && npx tsx -e "import('./src/lib/db.ts').then(async ({prisma}) => { const a = await prisma.application.findUnique({where:{id:'plaid-smoke-test'}}); console.log(a); process.exit(0); })"`

Expected: object with `id: 'plaid-smoke-test'`, `firstName: 'Plaid'`, `plaidAccessToken: null`.

- [ ] **Step 5: Re-run seed to verify upsert idempotency**

Run again: `npx tsx scripts/seed-plaid-test-app.ts`
Expected: same success log, no error. Row still has nulls for Plaid fields.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-plaid-test-app.ts package.json
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): seed fixed test application on every deploy"
```

---

## Task 2: Add admin auth gate for new route

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add the new path to ADMIN_PROTECTED**

Edit `src/middleware.ts`. Find the `ADMIN_PROTECTED` array (lines 7-20) and add `"/admin/plaid-test"` to it:

```ts
const ADMIN_PROTECTED = [
  "/admin/dashboard",
  "/admin/applications",
  "/admin/settings",
  "/admin/audit",
  "/admin/payments",
  "/admin/content",
  "/admin/pipeline",
  "/admin/contacts",
  "/admin/abandoned",
  "/admin/email",
  "/admin/sms",
  "/admin/team",
  "/admin/plaid-test",
];
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: no errors related to middleware.ts.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): gate /admin/plaid-test behind admin auth"
```

---

## Task 3: Add nav entry under Loan Portal

**Files:**
- Modify: `src/components/admin/top-nav.tsx`

- [ ] **Step 1: Add the nav sub-item**

Edit `src/components/admin/top-nav.tsx`. Find the "Loan Portal" section (around line 23-33) and add a new sub-item at the end of its `subItems` array:

Find this block:
```tsx
{
  label: "Loan Portal",
  // ...
  subItems: [
    { href: "/admin/dashboard", label: "Overview" },
    { href: "/admin/applications", label: "Applications" },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/admin/settings", label: "Settings" },
  ],
},
```

Add `{ href: "/admin/plaid-test", label: "Plaid test" }` after the Settings entry:

```tsx
subItems: [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/plaid-test", label: "Plaid test" },
],
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/top-nav.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): add nav entry under Loan Portal"
```

---

## Task 4: Test-only server actions

**Files:**
- Create: `src/actions/plaid-test.ts`

- [ ] **Step 1: Create the server actions file**

Create `src/actions/plaid-test.ts`:

```ts
"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

export const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
}

export type PlaidTestAppState = {
  plaidItemId: string | null;
  plaidAccountId: string | null;
  plaidAccessTokenStored: boolean;
  plaidLinkStale: boolean;
  monthlyIncome: number | null;
  bankBalance: number | null;
};

export async function getPlaidTestAppState(): Promise<PlaidTestAppState> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: {
      plaidItemId: true,
      plaidAccountId: true,
      plaidAccessToken: true,
      plaidLinkStale: true,
      monthlyIncome: true,
      bankBalance: true,
    },
  });
  if (!app) {
    throw new Error(`Test application ${PLAID_TEST_APP_ID} not found. Did the seed run?`);
  }
  return {
    plaidItemId: app.plaidItemId,
    plaidAccountId: app.plaidAccountId,
    plaidAccessTokenStored: !!app.plaidAccessToken,
    plaidLinkStale: app.plaidLinkStale,
    monthlyIncome: app.monthlyIncome ? Number(app.monthlyIncome) : null,
    bankBalance: app.bankBalance ? Number(app.bankBalance) : null,
  };
}

export async function persistPlaidLinkToTestApp(input: {
  accessToken: string; // already encrypted by /api/plaid/exchange-token
  itemId: string;
  accountId: string | null;
}) {
  await requireAdmin();
  await prisma.application.update({
    where: { id: PLAID_TEST_APP_ID },
    data: {
      plaidAccessToken: input.accessToken,
      plaidItemId: input.itemId,
      plaidAccountId: input.accountId,
      plaidLinkStale: false,
    },
  });
  return { ok: true as const };
}

export async function resetTestApp() {
  await requireAdmin();
  await prisma.application.update({
    where: { id: PLAID_TEST_APP_ID },
    data: {
      plaidAccessToken: null,
      plaidAccountId: null,
      plaidItemId: null,
      plaidLinkStale: false,
      monthlyIncome: null,
      bankBalance: null,
      increaseTransferId: null,
      increaseTransferStatus: null,
      increaseDisburseError: null,
    },
  });
  return { ok: true as const };
}

export type PlaidDebugDump = {
  ok: true;
  auth: unknown;
  identity: unknown;
  transactions: unknown;
} | {
  ok: false;
  error: string;
};

export async function getPlaidDebugDump(): Promise<PlaidDebugDump> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: { plaidAccessToken: true },
  });
  if (!app?.plaidAccessToken) {
    return { ok: false, error: "No Plaid token on test app. Run pipeline first." };
  }
  let accessToken: string;
  try {
    accessToken = decrypt(app.plaidAccessToken);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "decrypt failed" };
  }
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const [auth, identity, transactions] = await Promise.all([
      plaidClient.authGet({ access_token: accessToken }),
      plaidClient.identityGet({ access_token: accessToken }),
      plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: threeMonthsAgo.toISOString().split("T")[0],
        end_date: now.toISOString().split("T")[0],
      }),
    ]);
    return {
      ok: true,
      auth: auth.data,
      identity: identity.data,
      transactions: transactions.data,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errorMessage };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: no errors. If `authOptions` import fails, verify path with `grep -rn "export.*authOptions" src/lib/auth.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/plaid-test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): server actions for state, persist, reset, debug dump"
```

---

## Task 5: Server page wrapper

**Files:**
- Create: `src/app/admin/plaid-test/page.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/admin/plaid-test/page.tsx`:

```tsx
import { getPlaidTestAppState, PLAID_TEST_APP_ID } from "@/actions/plaid-test";
import { PlaidTestClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PlaidTestPage() {
  const initialState = await getPlaidTestAppState();

  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">Plaid smoke test</h1>
        <p className="mt-1 text-sm text-[#52525b]">
          Sandbox-only end-to-end test of the Plaid integration on a fixed seeded application
          (<code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">{PLAID_TEST_APP_ID}</code>).
          Uses sandbox credentials <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">user_good</code> /
          <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">pass_good</code>.
        </p>
      </header>
      <PlaidTestClient initialState={initialState} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: no errors. (`./client` won't resolve until Task 6, so this step may show that one error — note it and continue.)

- [ ] **Step 3: Commit (after Task 6 if typecheck blocks)**

If typecheck passes (because Next types are loose enough or `client` exists), commit now:
```bash
git add src/app/admin/plaid-test/page.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): server page wrapper for /admin/plaid-test"
```

If typecheck fails on missing `./client` import, do Task 6 first and combine the commits at the end of Task 6.

---

## Task 6: Client component (status panel + pipeline + reset + debug)

**Files:**
- Create: `src/app/admin/plaid-test/client.tsx`

- [ ] **Step 1: Create the client component**

Create `src/app/admin/plaid-test/client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import {
  getPlaidTestAppState,
  persistPlaidLinkToTestApp,
  resetTestApp,
  getPlaidDebugDump,
  type PlaidTestAppState,
  type PlaidDebugDump,
} from "@/actions/plaid-test";
import { fetchAndStoreIncome, ensureIncreaseExternalAccount } from "@/actions/plaid";

const TEST_APP_ID = "plaid-smoke-test";

type StepStatus = "pending" | "running" | "success" | "error";
type PipelineSteps = {
  link: StepStatus;
  persist: StepStatus;
  income: StepStatus;
  externalAccount: StepStatus;
};

const initialSteps: PipelineSteps = {
  link: "pending",
  persist: "pending",
  income: "pending",
  externalAccount: "pending",
};

export function PlaidTestClient({ initialState }: { initialState: PlaidTestAppState }) {
  const [state, setState] = useState<PlaidTestAppState>(initialState);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineSteps>(initialSteps);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [lastExternalAccountId, setLastExternalAccountId] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<PlaidDebugDump | null>(null);

  // Fetch a link token whenever we're not currently linked
  useEffect(() => {
    if (state.plaidAccessTokenStored) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: TEST_APP_ID }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setLinkToken(data.linkToken);
      } catch (err) {
        toast.error("Failed to create Plaid link token");
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.plaidAccessTokenStored]);

  const refreshState = async () => {
    const next = await getPlaidTestAppState();
    setState(next);
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      // Step 1 (link) succeeded
      setSteps((s) => ({ ...s, link: "success", persist: "running" }));
      setLastResult({ phase: "plaidLinkSuccess", metadata });

      try {
        // Exchange public token
        const exchangeRes = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            accountId: metadata.accounts[0]?.id,
          }),
        });
        if (!exchangeRes.ok) throw new Error(`exchange-token status ${exchangeRes.status}`);
        const exchanged = await exchangeRes.json();
        setLastResult({ phase: "exchange", exchanged });

        // Persist to test app
        const persistResult = await persistPlaidLinkToTestApp({
          accessToken: exchanged.accessToken,
          itemId: exchanged.itemId,
          accountId: exchanged.accountId,
        });
        if (!persistResult.ok) throw new Error("persist failed");
        setSteps((s) => ({ ...s, persist: "success", income: "running" }));
        await refreshState();

        // Fetch income & balance
        const incomeResult = await fetchAndStoreIncome(TEST_APP_ID);
        setLastResult({ phase: "income", incomeResult });
        if (!incomeResult.success) {
          setSteps((s) => ({ ...s, income: "error" }));
          toast.error(incomeResult.error || "Income fetch failed");
          await refreshState();
          setRunning(false);
          return;
        }
        setSteps((s) => ({ ...s, income: "success", externalAccount: "running" }));
        await refreshState();

        // Create Increase external account
        const extResult = await ensureIncreaseExternalAccount(TEST_APP_ID);
        setLastResult({ phase: "externalAccount", extResult });
        if (!extResult.ok) {
          setSteps((s) => ({ ...s, externalAccount: "error" }));
          toast.error(extResult.error || "External account creation failed");
          setRunning(false);
          return;
        }
        setLastExternalAccountId(extResult.externalAccountId);
        setSteps((s) => ({ ...s, externalAccount: "success" }));
        toast.success("Pipeline complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Pipeline failed: ${msg}`);
        setLastResult({ phase: "error", message: msg });
        setSteps((s) => {
          // Mark first non-success step as error
          if (s.persist === "running") return { ...s, persist: "error" };
          if (s.income === "running") return { ...s, income: "error" };
          if (s.externalAccount === "running") return { ...s, externalAccount: "error" };
          return s;
        });
      } finally {
        setRunning(false);
      }
    },
    onExit: (err) => {
      setRunning(false);
      if (err) {
        toast.error(`Plaid Link exited: ${err.error_code} ${err.error_message}`);
        setLastResult({ phase: "linkExit", error: err });
        setSteps((s) => ({ ...s, link: "error" }));
      }
    },
  });

  const onRunPipeline = () => {
    if (!ready || !linkToken) {
      toast.error("Plaid Link not ready yet");
      return;
    }
    setSteps({ ...initialSteps, link: "running" });
    setRunning(true);
    setLastResult(null);
    setLastExternalAccountId(null);
    open();
  };

  const onReset = async () => {
    setRunning(true);
    try {
      await resetTestApp();
      await refreshState();
      setSteps(initialSteps);
      setLastResult(null);
      setLastExternalAccountId(null);
      setDebugDump(null);
      // Refresh link token since we just cleared the connection
      setLinkToken(null);
      toast.success("Test app reset");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reset failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const onLoadDebugDump = async () => {
    const dump = await getPlaidDebugDump();
    setDebugDump(dump);
  };

  const fmtMoney = (n: number | null) =>
    n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Status panel */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Test app state</h2>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <Field label="plaidItemId" value={state.plaidItemId} />
          <Field label="plaidAccountId" value={state.plaidAccountId} />
          <Field
            label="plaidAccessToken"
            value={state.plaidAccessTokenStored ? "stored (encrypted)" : "—"}
          />
          <Field
            label="plaidLinkStale"
            value={state.plaidLinkStale ? "true" : "false"}
            warn={state.plaidLinkStale}
          />
          <Field label="monthlyIncome" value={fmtMoney(state.monthlyIncome)} />
          <Field label="bankBalance" value={fmtMoney(state.bankBalance)} />
          <Field label="lastExternalAccountId (client)" value={lastExternalAccountId} />
        </dl>
      </section>

      {/* Pipeline progress */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Pipeline</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <PipelineRow label="1. Plaid Link (sandbox)" status={steps.link} />
          <PipelineRow label="2. Persist tokens to test app" status={steps.persist} />
          <PipelineRow label="3. Fetch income + bank balance" status={steps.income} />
          <PipelineRow label="4. Create Increase external account" status={steps.externalAccount} />
        </ul>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={running || !ready || !linkToken}
            onClick={onRunPipeline}
            className="rounded-lg bg-[#15803d] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#166534]"
          >
            Run Plaid pipeline
          </button>
          <button
            type="button"
            disabled={running}
            onClick={onReset}
            className="rounded-lg bg-[#f4f4f5] text-[#0a0a0a] px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#e4e4e7]"
          >
            Reset test app
          </button>
          <button
            type="button"
            disabled={running || !state.plaidAccessTokenStored}
            onClick={onLoadDebugDump}
            className="rounded-lg bg-[#f4f4f5] text-[#0a0a0a] px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#e4e4e7]"
          >
            Load Plaid debug dump
          </button>
        </div>
      </section>

      {/* Last action result */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Last action result</h2>
        <pre className="text-xs bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 overflow-auto max-h-80">
          {lastResult ? JSON.stringify(lastResult, null, 2) : "(none yet)"}
        </pre>
      </section>

      {/* Debug dump */}
      {debugDump && (
        <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">
            Plaid debug dump (auth + identity + transactions)
          </h2>
          <pre className="text-xs bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 overflow-auto max-h-96">
            {JSON.stringify(debugDump, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  return (
    <>
      <dt className="text-[#71717a] truncate">{label}</dt>
      <dd className={`font-mono text-xs ${warn ? "text-[#b91c1c]" : "text-[#0a0a0a]"}`}>
        {value ?? "—"}
      </dd>
    </>
  );
}

function PipelineRow({ label, status }: { label: string; status: StepStatus }) {
  const icon = status === "success" ? "✓" : status === "error" ? "✗" : status === "running" ? "⏳" : "○";
  const color =
    status === "success"
      ? "text-[#15803d]"
      : status === "error"
      ? "text-[#b91c1c]"
      : status === "running"
      ? "text-[#0a0a0a]"
      : "text-[#a1a1aa]";
  return (
    <li className={`flex items-center gap-2 ${color}`}>
      <span className="font-mono w-4 text-center">{icon}</span>
      <span>{label}</span>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: zero errors.

If errors mention `usePlaidLink` types, verify the package is installed: `grep react-plaid-link package.json` (it is).

If errors mention server action import in client component, verify `"use server"` directive is at top of `src/actions/plaid-test.ts` (it is) — server actions can be imported into client components in Next.js 16.

- [ ] **Step 3: Run dev server, smoke-test render**

Run: `cd ~/pennylime && npm run dev`
In another terminal/browser: open `http://localhost:3000/admin/plaid-test`. You'll be redirected to login. Log in with seeded admin credentials, then return to the page.

Expected:
- Page renders without console errors
- Status panel shows test app fields, all `—` or `false`
- Pipeline section shows 4 rows, all `○` (pending)
- "Run Plaid pipeline" button enabled (or disabled briefly while link token is fetching, then enabled)
- "Load Plaid debug dump" button disabled (no token yet)

Don't click "Run Plaid pipeline" yet — local won't work without real Plaid sandbox keys. This is just a render smoke test.

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit Task 5 + 6 together**

```bash
git add src/app/admin/plaid-test/page.tsx src/app/admin/plaid-test/client.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(plaid-test): admin smoke-test page with full pipeline orchestration"
```

---

## Task 7: Final local typecheck and pre-deploy review

**Files:** none modified.

- [ ] **Step 1: Full typecheck**

Run: `cd ~/pennylime && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `cd ~/pennylime && npm run lint`
Expected: zero errors.

- [ ] **Step 3: Verify all expected files exist**

Run: `cd ~/pennylime && ls -la scripts/seed-plaid-test-app.ts src/actions/plaid-test.ts src/app/admin/plaid-test/page.tsx src/app/admin/plaid-test/client.tsx`
Expected: all four files present.

- [ ] **Step 4: Verify git log**

Run: `cd ~/pennylime && git log --oneline -10`
Expected: commits from tasks 1, 2, 3, 4, 6 (and 5 if separated) visible at the top, all referencing `plaid-test`.

---

## Task 8: Bar configures Railway env, then deploy and verify

**Files:** none modified.

This task is split across Bar (env setup) and the engineer (push + verify). Bar handles env vars himself per the spec.

- [ ] **Step 1: Bar — set Plaid env vars on Railway**

Bar runs from `~/pennylime` (after `railway link --project cheerful-gentleness`):

```bash
railway variables --service pennylime \
  --set "PLAID_CLIENT_ID=<sandbox client_id>" \
  --set "PLAID_SECRET=<sandbox secret>" \
  --set "PLAID_ENV=sandbox" \
  --set "PLAID_WEBHOOK_URL=https://pennylime.com/api/plaid/webhook"
```

Verify:
```bash
railway variables --service pennylime | grep PLAID
```
Expected: all four `PLAID_*` vars listed with non-placeholder values.

- [ ] **Step 2: Bar — confirm Increase env vars on Railway**

```bash
railway variables --service pennylime | grep INCREASE
```
Expected: `INCREASE_API_KEY`, `INCREASE_ACCOUNT_ID`, `INCREASE_ENV` all present and non-empty. If missing, Bar copies values from local `.env`:
```bash
railway variables --service pennylime \
  --set "INCREASE_API_KEY=<value from .env>" \
  --set "INCREASE_ACCOUNT_ID=<value from .env>" \
  --set "INCREASE_ENV=sandbox"
```

- [ ] **Step 3: Bar — register webhook URL in Plaid dashboard**

In Plaid sandbox dashboard → app settings → webhooks: add `https://pennylime.com/api/plaid/webhook` to allowed URLs.

Confirm Auth, Identity, Transactions products are enabled (they are by default).

- [ ] **Step 4: Push to main**

```bash
cd ~/pennylime && git push origin main
```

Watch Railway dashboard for deploy progress. Build script will run all six seed scripts including `seed-plaid-test-app.ts`. Confirm "Build successful" and the deployment is live.

- [ ] **Step 5: Run verification checklist**

Open `https://pennylime.com/admin/plaid-test` (log in if redirected). Confirm:

1. **Initial render** — status panel shows `plaidItemId: —`, `plaidAccountId: —`, `plaidAccessToken: —`, `monthlyIncome: —`, `bankBalance: —`. All four pipeline rows show `○`.

2. **Run pipeline** — click "Run Plaid pipeline".
   - Plaid Link modal opens. Pick "First Platypus Bank" (default sandbox). Enter `user_good` / `pass_good`. Pick a checking account. Modal closes clean.
   - Pipeline rows update to ✓ in order: link, persist, income, externalAccount.
   - "Pipeline complete" toast appears.

3. **Status panel after pipeline** — `plaidItemId` populated (`item_xxx`), `plaidAccountId` populated, `plaidAccessToken: stored (encrypted)`, `monthlyIncome` non-null number, `bankBalance` non-null number, `lastExternalAccountId (client)` shows `external_account_xxx`.

4. **Last action result panel** — shows JSON for the externalAccount phase with `extResult.ok === true` and an `externalAccountId`.

5. **Debug dump** — click "Load Plaid debug dump". Below the result panel, a JSON blob renders with `auth`, `identity`, and `transactions` keys. `transactions.transactions` array has at least one entry. `auth.numbers.ach[0]` has `routing` and `account` numbers.

6. **Reset** — click "Reset test app". Status panel returns to all `—`. Pipeline rows return to `○`. Toast "Test app reset" shows. `Run Plaid pipeline` becomes available again (a new link token is fetched).

7. **Re-run pipeline** — click "Run Plaid pipeline" again. All four steps go ✓ a second time.

8. **No console errors** — browser devtools console clean throughout. Railway logs show no unhandled exceptions (`railway logs --service pennylime`).

If any step fails: capture the error from "Last action result" + Railway logs, fix the underlying issue, push, re-verify. Reset the test app between attempts.

- [ ] **Step 6: Update memory — Plaid sandbox is live**

Once verified, update `~/.claude/projects/-Users-baralezrah/memory/project_pennylime.md` to record that Plaid sandbox is wired up and the smoke-test page exists at `/admin/plaid-test`. Also add a one-line entry in `MEMORY.md` if useful.

---

## Self-review notes (engineer/agent — do this before claiming done)

After implementing, verify against the spec:

- [ ] Spec section "Existing Plaid scaffolding" — confirmed not rebuilt: `src/lib/plaid.ts`, `/api/plaid/*`, `src/actions/plaid.ts` exports unchanged.
- [ ] Spec section "Test application seed" — `plaid-smoke-test` ID, full prerequisite fields, nullable Plaid fields, runs in build chain.
- [ ] Spec section "UI layout" — status panel with all listed fields, single "Run Plaid pipeline" button, "Reset test app", debug panel collapsible (rendered conditionally on `debugDump !== null`, which is the equivalent UX).
- [ ] Spec section "Server actions" — `persistPlaidLinkToTestApp`, `getPlaidDebugDump`, `resetTestApp`, `getPlaidTestAppState` all created. Existing `fetchAndStoreIncome` and `ensureIncreaseExternalAccount` called as-is.
- [ ] Spec section "Data flow" — sequence matches implementation in `client.tsx` `onSuccess`.
- [ ] Spec section "Error handling" — toasts on failure, red ✗ on failed pipeline row, raw error in last-result panel, no retry/rollback.
- [ ] Spec section "Env vars" — Bar handles Railway env via Task 8 step 1.
- [ ] Spec section "Verification checklist" — all six items covered in Task 8 step 5.

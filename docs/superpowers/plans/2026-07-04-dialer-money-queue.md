# Dialer Money Panel + Charge on Call + Queue Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the selected client's balance and missed payments in the dialer, let the agent charge them (specific missed payment or custom amount) during the call via the existing Increase ACH actions, and add a call-run queue that dials LATE then REPAYING contacts one after another.

**Architecture:** One new session-gated server action `getContactMoney` (resolver copied from getContact + getPaymentsSummary math + a pure missed-payment selector). One new client component `MoneyPanel` that calls the existing `retryPayment`/`chargePartialPayment` actions. Queue mode is pure client state in dialer-workspace.tsx driven by the dialer provider's phase transitions, with the queue-order builder extracted as a tested pure function.

**Tech Stack:** Next.js 16 App Router, Prisma 7, existing src/actions/payments.ts money paths (Increase ACH), vitest.

**Spec:** `docs/superpowers/specs/2026-07-04-dialer-money-queue-design.md`

**Conventions:** commits on main with inline identity (`git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit ...`) + Co-Authored-By Claude line; no em dashes; never commit `.pl_recipients.json` / `scripts/pause-notice-send.js`; verify with `npx tsc --noEmit` (zero errors) and `npm test`.

---

### Task 1: Pure helpers (TDD): missed-payment selector + call-queue builder

**Files:**
- Create: `src/lib/missed-payments.ts`
- Create: `src/app/admin/dialer/call-queue.ts`
- Test: `src/lib/missed-payments.test.ts`
- Test: `src/app/admin/dialer/call-queue.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/missed-payments.test.ts
import { describe, it, expect } from "vitest";
import { selectMissedPayments, type PaymentForSelector } from "./missed-payments";

const base = (over: Partial<PaymentForSelector>): PaymentForSelector => ({
  id: "p1",
  paymentNumber: 1,
  amount: 100,
  lateFee: 0,
  collectedAmount: 0,
  dueDate: new Date("2026-06-01"),
  status: "PENDING",
  increaseReturnReason: null,
  ...over,
});

const NOW = new Date("2026-07-01");

describe("selectMissedPayments", () => {
  it("includes FAILED, LATE, RETURNED, COLLECTIONS and overdue PENDING", () => {
    const rows = [
      base({ id: "a", status: "FAILED" }),
      base({ id: "b", status: "LATE" }),
      base({ id: "c", status: "RETURNED" }),
      base({ id: "d", status: "COLLECTIONS" }),
      base({ id: "e", status: "PENDING", dueDate: new Date("2026-06-20") }),
    ];
    expect(selectMissedPayments(rows, NOW).map((m) => m.paymentId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("excludes PAID, PROCESSING, WAIVED, CANCELED and future PENDING", () => {
    const rows = [
      base({ id: "a", status: "PAID" }),
      base({ id: "b", status: "PROCESSING" }),
      base({ id: "c", status: "WAIVED" }),
      base({ id: "d", status: "CANCELED" }),
      base({ id: "e", status: "PENDING", dueDate: new Date("2026-07-15") }),
    ];
    expect(selectMissedPayments(rows, NOW)).toEqual([]);
  });

  it("orders by dueDate ascending and computes outstanding", () => {
    const rows = [
      base({ id: "later", status: "FAILED", dueDate: new Date("2026-06-20"), amount: 100, lateFee: 15, collectedAmount: 40 }),
      base({ id: "first", status: "LATE", dueDate: new Date("2026-06-05") }),
    ];
    const out = selectMissedPayments(rows, NOW);
    expect(out.map((m) => m.paymentId)).toEqual(["first", "later"]);
    expect(out[1].outstanding).toBe(75); // 100 - 40 + 15
  });
});
```

```typescript
// src/app/admin/dialer/call-queue.test.ts
import { describe, it, expect } from "vitest";
import { buildCallQueue, type QueueContact } from "./call-queue";

const c = (id: string, stage: string, phone: string | null): QueueContact => ({ id, stage, phone });

describe("buildCallQueue", () => {
  const all = [
    c("r1", "REPAYING", "+15550000001"),
    c("l1", "LATE", "+15550000002"),
    c("lead", "LEAD", "+15550000003"),
    c("l2", "LATE", null),
    c("l3", "LATE", "+15550000004"),
  ];

  it("defaults to LATE then REPAYING, skipping missing phones", () => {
    expect(buildCallQueue(all, false, []).map((x) => x.id)).toEqual(["l1", "l3", "r1"]);
  });

  it("uses the filtered list in display order when a filter is active", () => {
    const filtered = [all[2], all[0], all[3]];
    expect(buildCallQueue(all, true, filtered).map((x) => x.id)).toEqual(["lead", "r1"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/missed-payments.test.ts src/app/admin/dialer/call-queue.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/missed-payments.ts
// Pure selector: which schedule rows count as "missed" for collection UIs.

export type PaymentForSelector = {
  id: string;
  paymentNumber: number;
  amount: number;
  lateFee: number;
  collectedAmount: number;
  dueDate: Date;
  status: string;
  increaseReturnReason: string | null;
};

export type MissedPayment = {
  paymentId: string;
  paymentNumber: number;
  amount: number;
  lateFee: number;
  collectedAmount: number;
  outstanding: number;
  dueDate: Date;
  status: string;
  returnReason: string | null;
};

const MISSED_STATUSES = new Set(["FAILED", "LATE", "RETURNED", "COLLECTIONS"]);

export function selectMissedPayments(payments: PaymentForSelector[], now: Date): MissedPayment[] {
  return payments
    .filter(
      (p) =>
        MISSED_STATUSES.has(p.status) ||
        (p.status === "PENDING" && p.dueDate.getTime() < now.getTime())
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((p) => ({
      paymentId: p.id,
      paymentNumber: p.paymentNumber,
      amount: p.amount,
      lateFee: p.lateFee,
      collectedAmount: p.collectedAmount,
      outstanding: Math.round((Math.max(0, p.amount - p.collectedAmount) + p.lateFee) * 100) / 100,
      dueDate: p.dueDate,
      status: p.status,
      returnReason: p.increaseReturnReason,
    }));
}
```

```typescript
// src/app/admin/dialer/call-queue.ts
// Pure builder for the call-run queue order.

export type QueueContact = { id: string; stage: string; phone: string | null };

/**
 * Default run: LATE stage first, then REPAYING. When the agent has an
 * active search/stage filter, the run is their filtered list in display
 * order instead. Contacts without phones are always skipped.
 */
export function buildCallQueue<T extends QueueContact>(
  all: T[],
  filterActive: boolean,
  filteredList: T[]
): T[] {
  const source = filterActive
    ? filteredList
    : [...all.filter((c) => c.stage === "LATE"), ...all.filter((c) => c.stage === "REPAYING")];
  return source.filter((c) => !!c.phone);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/missed-payments.test.ts src/app/admin/dialer/call-queue.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/missed-payments.ts src/lib/missed-payments.test.ts src/app/admin/dialer/call-queue.ts src/app/admin/dialer/call-queue.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: missed-payment selector and call-queue builder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: getContactMoney server action

**Files:**
- Modify: `src/actions/payments.ts` (append at end; file already has "use server", prisma, getServerSession/authOptions imports and getPaymentsSummary)

- [ ] **Step 1: Append the action**

```typescript
// --- Dialer workspace: balance + missed payments for a contact --------------

import { selectMissedPayments } from "@/lib/missed-payments";

export async function getContactMoney(contactId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { email: true, applicationId: true },
  });
  if (!contact) return null;

  // Resolve the primary advance the same way getContact does: linked app,
  // plus any application matching by ssnHash or email, FUNDED/LATE first.
  const linkedApp = contact.applicationId
    ? await prisma.application.findUnique({ where: { id: contact.applicationId }, select: { id: true, ssnHash: true } })
    : null;
  const apps = await prisma.application.findMany({
    where: {
      OR: [
        ...(linkedApp?.ssnHash ? [{ ssnHash: linkedApp.ssnHash }] : []),
        { email: { equals: contact.email, mode: "insensitive" as const } },
        ...(linkedApp ? [{ id: linkedApp.id }] : []),
      ],
    },
    select: { id: true, applicationCode: true, status: true, createdAt: true },
  });
  const STATUS_PRIORITY = ["FUNDED", "LATE", "APPROVED", "ACCEPTED", "PAID_OFF", "DEFAULTED", "PENDING", "REJECTED"];
  const sorted = [...apps].sort((a, b) => {
    const ai = STATUS_PRIORITY.indexOf(a.status);
    const bi = STATUS_PRIORITY.indexOf(b.status);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const primary = sorted[0];
  if (!primary) return null;

  // Only advances that actually have money movement are useful on a call.
  const ACTIVE = ["FUNDED", "ACTIVE", "REPAYING", "LATE", "PAID_OFF", "DEFAULTED", "COLLECTIONS"];
  if (!ACTIVE.includes(primary.status)) return null;

  const summary = await getPaymentsSummary(primary.id);
  const missed = selectMissedPayments(
    summary.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      amount: Number(p.amount),
      lateFee: Number(p.lateFee),
      collectedAmount: Number(p.collectedAmount ?? 0),
      dueDate: p.dueDate,
      status: p.status,
      increaseReturnReason: p.increaseReturnReason ?? null,
    })),
    new Date()
  );

  const paidCount = summary.payments.filter((p) => p.status === "PAID").length;
  const next = summary.nextPayment;

  return {
    applicationId: primary.id,
    applicationCode: primary.applicationCode,
    status: primary.status,
    remainingBalance: summary.remainingBalance,
    totalOwed: summary.totalOwed,
    totalPaid: summary.totalPaid,
    totalLateFees: summary.totalLateFees,
    paidCount,
    totalCount: summary.payments.length,
    nextDue: next
      ? {
          paymentId: next.id,
          amount: Number(next.amount),
          lateFee: Number(next.lateFee),
          dueDate: next.dueDate.toISOString(),
          status: next.status,
        }
      : null,
    missed: missed.map((m) => ({ ...m, dueDate: m.dueDate.toISOString() })),
  };
}
```

Adjustments allowed: move the `import { selectMissedPayments }` to the top of the file with the other imports (imports mid-file are invalid); verify `applicationCode` exists on Application (it is used by getAllPayments in the same file); if `mode: "insensitive"` is not used elsewhere in this codebase for email matching, check getContact's exact OR clause and replicate it.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (zero errors) and `npm test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add src/actions/payments.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "payments: getContactMoney action for the dialer money panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: MoneyPanel component + workspace wiring

**Files:**
- Create: `src/app/admin/dialer/money-panel.tsx`
- Modify: `src/app/admin/dialer/dialer-workspace.tsx` (render MoneyPanel between the contact header card and the Notes card)

- [ ] **Step 1: Implement MoneyPanel (complete file)**

```tsx
// src/app/admin/dialer/money-panel.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getContactMoney, retryPayment, chargePartialPayment } from "@/actions/payments";

type Money = NonNullable<Awaited<ReturnType<typeof getContactMoney>>>;

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Two-tap confirm button: first tap arms for 5s, second tap fires. */
function ConfirmChargeButton({
  label,
  confirmLabel,
  disabled,
  onCharge,
}: {
  label: string;
  confirmLabel: string;
  disabled?: boolean;
  onCharge: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const click = async () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    setBusy(true);
    try {
      await onCharge();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={click}
      disabled={disabled || busy}
      className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
        armed ? "bg-[#dc2626] text-white" : "bg-[#18181b] text-white"
      }`}
    >
      {busy ? "Charging..." : armed ? confirmLabel : label}
    </button>
  );
}

export function MoneyPanel({ contactId }: { contactId: string }) {
  const [money, setMoney] = useState<Money | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);
  const [chargeMsg, setChargeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const contactRef = useRef(contactId);
  contactRef.current = contactId;

  const load = useCallback(() => {
    const forId = contactId;
    setError(null);
    getContactMoney(forId)
      .then((m) => { if (contactRef.current === forId) setMoney(m); })
      .catch(() => { if (contactRef.current === forId) { setMoney(null); setError("Could not load balance."); } });
  }, [contactId]);

  useEffect(() => {
    setMoney(undefined);
    setChargeMsg(null);
    setCustomAmount("");
    load();
  }, [contactId, load]);

  const runCharge = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    const forId = contactId;
    setChargeMsg(null);
    const res = await fn();
    if (contactRef.current !== forId) return;
    if (res.success) {
      setChargeMsg({ ok: true, text: "ACH debit initiated." });
      setCustomAmount("");
      load();
    } else {
      setChargeMsg({ ok: false, text: res.error || "Charge failed." });
    }
  };

  if (money === undefined && !error) {
    return <div className="rounded-xl border border-[#e4e4e7] bg-white p-5 text-[13px] text-[#71717a]">Loading balance...</div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-[#e4e4e7] bg-white p-5 text-[13px] text-[#71717a]">
        {error}{" "}
        <button onClick={() => { setMoney(undefined); load(); }} className="text-[#2563eb] hover:underline">Retry</button>
      </div>
    );
  }
  if (money === null) {
    return <div className="rounded-xl border border-[#e4e4e7] bg-white p-5 text-[13px] text-[#71717a]">No active advance.</div>;
  }

  const isLate = money.status === "LATE" || money.missed.length > 0;
  const oldest = money.missed[0];
  const parsedAmount = Number(customAmount);
  const amountValid =
    oldest && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= oldest.outstanding + 0.001;

  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-black">Advance {money.applicationCode}</h3>
        {isLate && (
          <span className="rounded-full bg-[#fef2f2] text-[#dc2626] px-2 py-0.5 text-[10px] font-bold">LATE</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-[#71717a]">Remaining</p>
          <p className="text-[18px] font-semibold text-[#18181b]">{usd(money.remainingBalance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-[#71717a]">Late fees</p>
          <p className="text-[15px] font-medium text-[#dc2626]">{usd(money.totalLateFees)}</p>
        </div>
        <div>
          <p className="text-[11px] text-[#71717a]">Payments</p>
          <p className="text-[15px] font-medium text-[#18181b]">{money.paidCount} of {money.totalCount} paid</p>
        </div>
        <div>
          <p className="text-[11px] text-[#71717a]">Next due</p>
          <p className="text-[15px] font-medium text-[#18181b]">
            {money.nextDue ? `${usd(money.nextDue.amount)} on ${new Date(money.nextDue.dueDate).toLocaleDateString()}` : "none"}
          </p>
        </div>
      </div>

      {chargeMsg && (
        <p className={`text-[12px] mb-3 ${chargeMsg.ok ? "text-[#15803d]" : "text-[#dc2626]"}`}>{chargeMsg.text}</p>
      )}

      {money.missed.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-[#18181b] mb-2">Missed payments</p>
          <div className="space-y-2">
            {money.missed.map((m) => (
              <div key={m.paymentId} className="flex items-center justify-between gap-2 rounded-lg bg-[#fef2f2] border border-[#fecaca] p-2.5">
                <div className="text-[12px] text-[#3f3f46]">
                  <span className="font-medium">#{m.paymentNumber}</span> {usd(m.outstanding)}
                  {m.lateFee > 0 && <span className="text-[#dc2626]"> (incl. {usd(m.lateFee)} fee)</span>}
                  <span className="text-[#71717a]"> due {new Date(m.dueDate).toLocaleDateString()}</span>
                  {m.returnReason && <span className="text-[#dc2626]"> - {m.returnReason}</span>}
                </div>
                <ConfirmChargeButton
                  label={`Charge ${usd(m.outstanding)}`}
                  confirmLabel="Confirm?"
                  onCharge={() => runCharge(() => retryPayment(m.paymentId))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {oldest && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-[#71717a] block mb-1">
              Custom amount (max {usd(oldest.outstanding)} on #{oldest.paymentNumber})
            </label>
            <input
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-lg border border-[#e4e4e7] px-3 py-1.5 text-[13px]"
            />
          </div>
          <ConfirmChargeButton
            label={amountValid ? `Charge ${usd(parsedAmount)}` : "Charge"}
            confirmLabel={`Confirm ${amountValid ? usd(parsedAmount) : ""}?`}
            disabled={!amountValid}
            onCharge={() => runCharge(() => chargePartialPayment(oldest.paymentId, parsedAmount))}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the workspace**

In `src/app/admin/dialer/dialer-workspace.tsx`: `import { MoneyPanel } from "./money-panel";` and inside the Contact tab (`tab === "contact" && selected`), render `<MoneyPanel contactId={selected.id} />` directly after the header card div and before the Notes card div.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dialer/money-panel.tsx src/app/admin/dialer/dialer-workspace.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: money panel with balance, missed payments, charge on call

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Queue mode (call run)

**Files:**
- Modify: `src/app/admin/dialer/dialer-workspace.tsx`

- [ ] **Step 1: Add run state and logic**

Additions inside `DialerWorkspace` (read the current file first; integrate carefully):

```tsx
import { buildCallQueue } from "./call-queue";
// add useEffect to the react import if not present

type RunState = {
  queue: ContactRow[];
  index: number;
  status: "dialing" | "between" | "paused";
  countdown: number;
};

const [run, setRun] = useState<RunState | null>(null);
const runRef = useRef<RunState | null>(null);
runRef.current = run;
const prevPhaseRef = useRef(state.phase);

const dialContact = useCallback((c: ContactRow) => {
  selectContact(c);
  if (c.phone) void startCall({ phone: c.phone, name: c.name || c.phone, contactId: c.id });
}, [selectContact, startCall]);

const startRun = () => {
  const filterActive = search.trim() !== "" || stage !== "ALL";
  const queue = buildCallQueue(contacts, filterActive, filtered);
  if (queue.length === 0) return;
  setRun({ queue, index: 0, status: "dialing", countdown: 0 });
  dialContact(queue[0]);
};

const endRun = () => setRun(null);

const advanceRun = useCallback((immediate: boolean) => {
  setRun((r) => {
    if (!r) return r;
    const nextIndex = r.index + 1;
    if (nextIndex >= r.queue.length) return null; // run finished
    if (immediate) {
      dialContact(r.queue[nextIndex]);
      return { ...r, index: nextIndex, status: "dialing", countdown: 0 };
    }
    return { ...r, index: nextIndex, status: "between", countdown: 3 };
  });
}, [dialContact]);

// Advance when a wrap-up is completed while a run is active.
useEffect(() => {
  const prev = prevPhaseRef.current;
  prevPhaseRef.current = state.phase;
  const r = runRef.current;
  if (!r) return;
  if (prev === "wrap-up" && state.phase === "idle" && r.status === "dialing") {
    advanceRun(false);
  }
  if (state.phase === "error" && r.status === "dialing") {
    setRun((cur) => (cur ? { ...cur, status: "paused", countdown: 0 } : cur));
  }
}, [state.phase, advanceRun]);

// Between-calls countdown: tick once per second, dial when it hits 0.
useEffect(() => {
  if (!run || run.status !== "between") return;
  const t = setTimeout(() => {
    setRun((r) => {
      if (!r || r.status !== "between") return r;
      if (r.countdown <= 1) {
        dialContact(r.queue[r.index]);
        return { ...r, status: "dialing", countdown: 0 };
      }
      return { ...r, countdown: r.countdown - 1 };
    });
  }, 1000);
  return () => clearTimeout(t);
}, [run, dialContact]);

const pauseRun = () => setRun((r) => (r ? { ...r, status: "paused", countdown: 0 } : r));
const resumeRun = () => {
  setRun((r) => (r ? { ...r, status: "dialing" } : r));
  const r = runRef.current;
  if (r && state.phase === "idle") dialContact(r.queue[r.index]);
};
const skipRun = () => {
  if (state.phase === "in-call" || state.phase === "ringing" || state.phase === "connecting") {
    hangUp(); // wrap-up will appear; saving it advances via the effect
  } else {
    advanceRun(true);
  }
};
```

NOTE on the between-countdown effect: the `advanceRun(false)` path sets `status: "between", countdown: 3` and `index` already pointing at the NEXT contact, so `dialContact(r.queue[r.index])` dials the right person when the countdown expires. `resumeRun` after a pause re-dials the current index only when no call is active. `hangUp` comes from the existing `useDialer()` destructure; add it if not already destructured.

- [ ] **Step 2: Add the run UI**

Start button above the contact list (before the search input):

```tsx
<button
  onClick={startRun}
  disabled={!!run || buildCallQueue(contacts, search.trim() !== "" || stage !== "ALL", filtered).length === 0}
  className="w-full mb-3 rounded-lg bg-[#15803d] text-white py-2 text-[13px] font-semibold disabled:opacity-40"
>
  &#9742; Start call run {stage === "ALL" && !search.trim() ? "(Late, then Repaying)" : "(current filter)"}
</button>
```

Queue bar, rendered instead of the tab-buttons row when `run` is non-null (keep the tab content below it; the Contact tab stays active during a run):

```tsx
{run && (
  <div className="flex items-center justify-between gap-2 mb-4 rounded-lg bg-[#18181b] text-white px-3 py-2">
    <span className="text-[13px] font-medium">
      Call run: {run.index + 1} of {run.queue.length}
      {run.status === "between" && ` - calling next in ${run.countdown}...`}
      {run.status === "paused" && " - paused"}
    </span>
    <div className="flex gap-1.5">
      {run.status === "paused" ? (
        <button onClick={resumeRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">Resume</button>
      ) : (
        <button onClick={pauseRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">Pause</button>
      )}
      <button onClick={skipRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">Skip</button>
      <button onClick={endRun} className="rounded bg-white/15 px-2 py-1 text-[12px]">End run</button>
    </div>
  </div>
)}
```

Wrap the existing tab-button row in `{!run && (...)}` so the bar replaces it during a run.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` zero errors; `npm test` all pass; `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dialer/dialer-workspace.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: call-run queue with auto-advance, pause, and skip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification and deploy

- [ ] **Step 1:** `npm test` all pass; `npx tsc --noEmit` zero errors; `npm run build` succeeds.
- [ ] **Step 2:** Deploy: `git push origin main`; verify `railway deployment list | head -3` reaches SUCCESS (expect a short 502 boot window).
- [ ] **Step 3:** Manual acceptance: select a LATE client and compare the money panel numbers with their application page; charge a small custom amount on a test payment and watch it flip to PROCESSING; start a call run with a stage filter and verify auto-advance after wrap-up, pause during countdown, skip mid-call, end run.

---

## Self-review notes

- Spec coverage: pure helpers (Task 1), getContactMoney (Task 2), MoneyPanel with summary strip/missed list/custom charge/confirm/refetch/race guard (Task 3), queue with default order, filter passthrough, countdown, pause/skip/end, error auto-pause (Task 4), verify + deploy (Task 5).
- Type consistency: MissedPayment.outstanding used by MoneyPanel cap and charge target; buildCallQueue consumes ContactRow (superset of QueueContact); dialContact uses the existing selectContact/startCall signatures.
- Charge actions return { success, error? } per src/actions/payments.ts; runCharge handles exactly that shape.

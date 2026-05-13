"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ensureExternalAccountForTest,
  fireTestCredit,
  fireTestDebit,
  getIncreaseTransferStatusById,
  type IncreaseTestState,
} from "@/actions/increase-test";

export function IncreaseTestClient({ initialState }: { initialState: IncreaseTestState }) {
  const [state, setState] = useState<IncreaseTestState>(initialState);
  const [busy, setBusy] = useState(false);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [debitAmount, setDebitAmount] = useState<number>(50);
  const [lastResult, setLastResult] = useState<unknown>(null);

  async function handleEnsureExternal() {
    setBusy(true);
    try {
      const r = await ensureExternalAccountForTest();
      setLastResult({ phase: "ensureExternalAccount", result: r });
      if (r.ok) {
        setState((s) => ({ ...s, lastExternalAccountId: r.externalAccountId }));
        toast.success(`ExternalAccount ${r.externalAccountId}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCredit() {
    setBusy(true);
    try {
      const r = await fireTestCredit({ amountCents: Math.round(creditAmount * 100) });
      setLastResult({ phase: "credit", result: r });
      if (r.ok) {
        setState((s) => ({
          ...s,
          lastCreditTransferId: r.transferId,
          lastExternalAccountId: r.externalAccountId,
        }));
        toast.success(`Credit fired: ${r.transferId}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDebit() {
    setBusy(true);
    try {
      const r = await fireTestDebit({ amountCents: Math.round(debitAmount * 100) });
      setLastResult({ phase: "debit", result: r });
      if (r.ok) {
        setState((s) => ({
          ...s,
          lastDebitTransferId: r.transferId,
          lastExternalAccountId: r.externalAccountId,
        }));
        toast.success(`Debit fired: ${r.transferId}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckStatus(transferId: string | null) {
    if (!transferId) return;
    setBusy(true);
    try {
      const r = await getIncreaseTransferStatusById(transferId);
      setLastResult({ phase: "status", transferId, result: r });
      if (r.ok) {
        toast.success(`Status: ${(r.data as { status?: string })?.status ?? "unknown"}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status panel */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Test app state</h2>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <Field label="Plaid linked" value={state.plaidLinked ? "yes" : "no — link via /admin/plaid-test first"} warn={!state.plaidLinked} />
          <Field label="Last ExternalAccount" value={state.lastExternalAccountId} />
          <Field label="Last credit transfer" value={state.lastCreditTransferId} />
          <Field label="Last debit transfer" value={state.lastDebitTransferId} />
        </dl>
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Actions</h2>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            disabled={busy || !state.plaidLinked}
            onClick={handleEnsureExternal}
            className="self-start rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#fafafa] disabled:opacity-50"
          >
            1. Ensure Increase ExternalAccount
          </button>

          <div className="flex items-center gap-3">
            <label className="text-xs text-[#52525b] flex items-center gap-2">
              <span>Credit (push)</span>
              <input
                type="number"
                min={1}
                step={10}
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
                className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
              />
              <span>USD</span>
            </label>
            <button
              type="button"
              disabled={busy || !state.plaidLinked}
              onClick={handleCredit}
              className="rounded-lg bg-[#15803d] text-white px-4 py-2 text-sm font-semibold hover:bg-[#166534] disabled:opacity-50"
            >
              2. Fire test credit
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-[#52525b] flex items-center gap-2">
              <span>Debit (pull)</span>
              <input
                type="number"
                min={1}
                step={10}
                value={debitAmount}
                onChange={(e) => setDebitAmount(Number(e.target.value))}
                className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
              />
              <span>USD</span>
            </label>
            <button
              type="button"
              disabled={busy || !state.plaidLinked}
              onClick={handleDebit}
              className="rounded-lg bg-[#0ea5e9] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0284c7] disabled:opacity-50"
            >
              3. Fire test debit
            </button>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={busy || !state.lastCreditTransferId}
              onClick={() => handleCheckStatus(state.lastCreditTransferId)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#fafafa] disabled:opacity-50"
            >
              Check credit status
            </button>
            <button
              type="button"
              disabled={busy || !state.lastDebitTransferId}
              onClick={() => handleCheckStatus(state.lastDebitTransferId)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#fafafa] disabled:opacity-50"
            >
              Check debit status
            </button>
          </div>
        </div>
      </section>

      {/* Last action result */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Last action result</h2>
        <pre className="text-xs bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 overflow-auto max-h-80">
          {lastResult ? JSON.stringify(lastResult, null, 2) : "(none yet)"}
        </pre>
      </section>
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

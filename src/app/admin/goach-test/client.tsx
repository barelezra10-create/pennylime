"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  provisionGoachTestManual,
  resetGoachTest,
  fireGoachTestDebit,
  fireGoachTestCredit,
  getGoachTestStatus,
  cancelGoachTest,
  type GoachTestState,
} from "@/actions/goach-test";

type FiredTx = {
  uuid: string;
  transactionId: string;
  status: string;
  type: "debit" | "credit";
};

export function GoachTestClient({ initialState }: { initialState: GoachTestState }) {
  const [state, setState] = useState<GoachTestState>(initialState);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState<number>(1.0);
  const [firedTxs, setFiredTxs] = useState<FiredTx[]>([]);
  const [statusUuid, setStatusUuid] = useState("");
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [routingNumber, setRoutingNumber] = useState("021000021");
  const [accountNumber, setAccountNumber] = useState("123456789");

  async function handleProvision() {
    setBusy(true);
    try {
      const r = await provisionGoachTestManual({ routingNumber, accountNumber });
      setLastResult({ phase: "provision", result: r });
      if (r.ok) {
        setState((s) => ({
          ...s,
          goachReceiverUuid: r.receiverUuid,
          goachBankAccountUuid: r.bankAccountUuid,
        }));
        toast.success(`Receiver ${r.receiverUuid} / Bank ${r.bankAccountUuid}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    try {
      await resetGoachTest();
      setState((s) => ({ ...s, goachReceiverUuid: null, goachBankAccountUuid: null }));
      setLastResult({ phase: "reset", result: { ok: true } });
      toast.success("Test reset — receiver/bank uuids cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDebit() {
    setBusy(true);
    try {
      const r = await fireGoachTestDebit({ amountCents: Math.round(amount * 100) });
      setLastResult({ phase: "debit", result: r });
      if (r.ok) {
        const tx: FiredTx = { uuid: r.uuid, transactionId: r.transactionId, status: r.status, type: "debit" };
        setFiredTxs((prev) => [tx, ...prev]);
        toast.success(`Debit fired: ${r.uuid}`);
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
      const r = await fireGoachTestCredit({ amountCents: Math.round(amount * 100) });
      setLastResult({ phase: "credit", result: r });
      if (r.ok) {
        const tx: FiredTx = { uuid: r.uuid, transactionId: r.transactionId, status: r.status, type: "credit" };
        setFiredTxs((prev) => [tx, ...prev]);
        toast.success(`Credit fired: ${r.uuid}`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckStatus(uuid: string) {
    if (!uuid.trim()) return;
    setBusy(true);
    try {
      const r = await getGoachTestStatus(uuid.trim());
      setLastResult({ phase: "status", uuid, result: r });
      if (r.ok) {
        toast.success(`GoACH: ${r.status} / mapped: ${r.mappedStatus.paymentStatus}`);
        setFiredTxs((prev) =>
          prev.map((tx) => (tx.uuid === uuid.trim() ? { ...tx, status: r.status } : tx))
        );
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(uuid: string) {
    setBusy(true);
    try {
      const r = await cancelGoachTest(uuid);
      setLastResult({ phase: "cancel", uuid, result: r });
      if (r.ok) {
        toast.success(`Cancelled: ${r.status}`);
        setFiredTxs((prev) =>
          prev.map((tx) => (tx.uuid === uuid ? { ...tx, status: r.status } : tx))
        );
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canFire = state.goachConfigured && !!state.goachBankAccountUuid;

  return (
    <div className="flex flex-col gap-6">
      {/* State panel */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Test app state</h2>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <Field
            label="App"
            value={`${state.firstName} ${state.lastName} (${state.applicationId})`}
          />
          <Field
            label="Plaid linked"
            value={state.plaidLinked ? "yes" : "no — link a bank via the apply funnel first"}
            warn={!state.plaidLinked}
          />
          <Field
            label="GoACH configured"
            value={
              state.goachConfigured
                ? "yes"
                : "no — requires GOACH_API_KEY + GOACH_ORIGINATOR_UUID"
            }
            warn={!state.goachConfigured}
          />
          <Field label="GoACH receiver uuid" value={state.goachReceiverUuid} />
          <Field label="GoACH bank account uuid" value={state.goachBankAccountUuid} />
        </dl>
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Actions</h2>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[#52525b] flex flex-col gap-1">
                <span>Routing number</span>
                <input
                  type="text"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  placeholder="021000021"
                  className="w-40 rounded border border-gray-200 px-2 py-1 text-sm font-mono"
                />
              </label>
              <label className="text-xs text-[#52525b] flex flex-col gap-1">
                <span>Account number</span>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="123456789"
                  className="w-40 rounded border border-gray-200 px-2 py-1 text-sm font-mono"
                />
              </label>
              <button
                type="button"
                disabled={busy || !state.goachConfigured}
                onClick={handleProvision}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#fafafa] disabled:opacity-50"
              >
                1. Provision GoACH receiver + bank
              </button>
            </div>
            <p className="text-xs text-[#71717a]">
              GoACH staging is simulated; these are standard ACH test numbers, no real bank needed.
            </p>
          </div>
          {state.goachReceiverUuid && (
            <p className="text-xs text-[#52525b]">
              Receiver: <code className="bg-[#f4f4f5] px-1 rounded">{state.goachReceiverUuid}</code>
              {" / "}
              Bank: <code className="bg-[#f4f4f5] px-1 rounded">{state.goachBankAccountUuid}</code>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
            <label className="text-xs text-[#52525b] flex items-center gap-2">
              <span>Amount</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-24 rounded border border-gray-200 px-2 py-1 text-sm"
              />
              <span>USD</span>
            </label>
            <button
              type="button"
              disabled={busy || !canFire}
              onClick={handleDebit}
              className="rounded-lg bg-[#0ea5e9] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0284c7] disabled:opacity-50"
            >
              2. Fire test debit (pull)
            </button>
            <button
              type="button"
              disabled={busy || !canFire}
              onClick={handleCredit}
              className="rounded-lg bg-[#15803d] text-white px-4 py-2 text-sm font-semibold hover:bg-[#166534] disabled:opacity-50"
            >
              3. Fire test credit (push)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleReset}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
            >
              Reset test
            </button>
          </div>
        </div>
      </section>

      {/* Fired transactions */}
      {firedTxs.length > 0 && (
        <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">
            Fired transactions this session
          </h2>
          <div className="flex flex-col gap-3">
            {firedTxs.map((tx) => (
              <div
                key={tx.uuid}
                className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-xs font-mono flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span>
                    <span className={`font-bold uppercase mr-2 ${tx.type === "debit" ? "text-[#0284c7]" : "text-[#15803d]"}`}>
                      {tx.type}
                    </span>
                    uuid: <span className="text-[#0a0a0a]">{tx.uuid}</span>
                  </span>
                  <span className="text-[#52525b]">tx_id: {tx.transactionId || "(none)"}</span>
                  <span className="text-[#71717a]">status: {tx.status}</span>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleCheckStatus(tx.uuid)}
                    className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-[#f4f4f5] disabled:opacity-50"
                  >
                    Check status
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleCancel(tx.uuid)}
                    className="rounded border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Manual status check */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Check status by uuid</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="GoACH transaction uuid"
            value={statusUuid}
            onChange={(e) => setStatusUuid(e.target.value)}
            className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm font-mono"
          />
          <button
            type="button"
            disabled={busy || !statusUuid.trim()}
            onClick={() => handleCheckStatus(statusUuid)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#fafafa] disabled:opacity-50"
          >
            Check
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
    </div>
  );
}

function Field({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | null;
  warn?: boolean;
}) {
  return (
    <>
      <dt className="text-[#71717a] truncate">{label}</dt>
      <dd className={`font-mono text-xs ${warn ? "text-[#b91c1c]" : "text-[#0a0a0a]"}`}>
        {value ?? "-"}
      </dd>
    </>
  );
}

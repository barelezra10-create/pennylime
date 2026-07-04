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
  if (money == null) {
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

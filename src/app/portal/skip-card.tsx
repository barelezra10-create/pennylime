"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { executeSkip } from "@/actions/portal-skip";

type Quote = {
  ok: true;
  feeAmount: number;
  skippedPaymentId: string;
  skippedPaymentNumber: number;
  skippedDueDate: string;
  skippedAmount: number;
  newDueDate: string;
  skipsUsed: number;
  maxSkips: number;
};

function fmtMoney(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SkipCard({ quote }: { quote: Quote }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const r = await executeSkip();
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.refresh(), 1200);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#15803d] bg-[#f0fdf4] p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#15803d] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#15803d]">Payment skipped.</h2>
            <p className="text-[13px] text-[#15803d]/80 mt-0.5">
              Your payment due {fmtDate(quote.skippedDueDate)} has moved to {fmtDate(quote.newDueDate)}. We've initiated a {fmtMoney(quote.feeAmount)} fee debit and it usually settles in 1-2 business days.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e4e4e7] bg-white p-6 lg:p-7 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1">
            Need a break this week?
          </span>
          <h2 className="mt-3 text-[20px] font-bold tracking-tight">Skip your next payment.</h2>
          <p className="mt-1.5 text-[13px] text-[#52525b] max-w-xl">
            Push your <strong>{fmtMoney(quote.skippedAmount)}</strong> payment due {fmtDate(quote.skippedDueDate)} to the end of your schedule. One-time use per advance.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Payment skipped" value={fmtMoney(quote.skippedAmount)} sub={`#${quote.skippedPaymentNumber} due ${fmtDate(quote.skippedDueDate)}`} />
        <Stat label="New due date" value={fmtDate(quote.newDueDate)} sub="added to end of schedule" />
        <Stat label="Skip fee" value={fmtMoney(quote.feeAmount)} sub="5% of advance · charged today" amber />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0a0a0a] hover:bg-[#27272a] text-white text-[14px] font-semibold px-5 py-2.5 transition-colors"
          >
            Skip this payment for {fmtMoney(quote.feeAmount)}
          </button>
        ) : (
          <div className="w-full bg-[#fafafa] border border-[#e4e4e7] rounded-xl p-4">
            <p className="text-[13px] text-[#0a0a0a] font-semibold mb-2">
              Confirm skip: payment <strong>#{quote.skippedPaymentNumber}</strong> moves from {fmtDate(quote.skippedDueDate)} → {fmtDate(quote.newDueDate)}, and we'll debit a one-time <span className="tabular-nums">{fmtMoney(quote.feeAmount)}</span> skip fee.
            </p>
            <p className="text-[12px] text-[#71717a] mb-4">
              You can only skip once per advance. The fee is charged immediately as a separate ACH debit (settles 1-2 business days).
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] hover:bg-[#27272a] disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-2 transition-colors"
              >
                {submitting ? "Processing..." : "Yes, skip this payment"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={submitting}
                className="text-[12px] font-semibold text-[#71717a] hover:text-black px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, amber }: { label: string; value: string; sub?: string; amber?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${amber ? "border-amber-200 bg-amber-50" : "border-[#e4e4e7] bg-[#fafaf7]"}`}>
      <div className={`text-[10px] uppercase tracking-[0.08em] font-semibold ${amber ? "text-amber-800" : "text-[#71717a]"}`}>
        {label}
      </div>
      <div className={`mt-1 text-[16px] font-bold tabular-nums ${amber ? "text-amber-900" : "text-[#0a0a0a]"}`}>
        {value}
      </div>
      {sub ? <div className={`text-[11px] mt-0.5 ${amber ? "text-amber-700" : "text-[#52525b]"}`}>{sub}</div> : null}
    </div>
  );
}

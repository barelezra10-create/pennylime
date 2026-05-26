"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { executePayoff } from "@/actions/portal-payoff";

type Quote = {
  ok: true;
  outstandingPrincipal: number;
  accruedInterestSinceLastPayment: number;
  payoffAmount: number;
  scheduledRemaining: number;
  savings: number;
  weeksSinceAnchor: number;
};

function fmtMoney(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function PayoffCard({ quote }: { quote: Quote }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const r = await executePayoff();
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone(true);
    // Refresh after a beat so the new payment row + waived statuses show up.
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
            <h2 className="text-[15px] font-bold text-[#15803d]">Payoff started.</h2>
            <p className="text-[13px] text-[#15803d]/80 mt-0.5">
              We've initiated an ACH debit for {fmtMoney(quote.payoffAmount)}. It typically settles in 1-2 business days. We'll email you when it posts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#15803d] bg-gradient-to-br from-[#f0fdf4] to-white p-6 lg:p-7 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#15803d] text-white text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1">
            Save money
          </span>
          <h2 className="mt-3 text-[20px] font-bold tracking-tight">Pay off early. Only pay for the time you held the money.</h2>
          <p className="mt-1.5 text-[13px] text-[#52525b] max-w-xl">
            Skip the remaining scheduled interest. You pay back the outstanding principal plus interest accrued since your last payment — nothing more.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Outstanding principal" value={fmtMoney(quote.outstandingPrincipal)} />
        <Stat label="Accrued interest" value={fmtMoney(quote.accruedInterestSinceLastPayment)} sub={`${quote.weeksSinceAnchor.toFixed(1)} wks since last paid`} />
        <Stat label="If you let it run" value={fmtMoney(quote.scheduledRemaining)} sub="remaining schedule" />
        <Stat label="Pay off today" value={fmtMoney(quote.payoffAmount)} accent />
      </div>

      {quote.savings > 0 ? (
        <div className="mt-4 rounded-lg bg-white border border-[#dcfce7] p-3 text-[13px] text-[#15803d] font-semibold flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
          You save {fmtMoney(quote.savings)} vs. completing the schedule.
        </div>
      ) : null}

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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[14px] font-semibold px-5 py-2.5 transition-colors"
          >
            Pay off {fmtMoney(quote.payoffAmount)} now
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        ) : (
          <div className="w-full bg-white border border-[#e4e4e7] rounded-xl p-4">
            <p className="text-[13px] text-[#0a0a0a] font-semibold mb-2">
              Confirm payoff: we'll initiate an ACH debit for <span className="tabular-nums">{fmtMoney(quote.payoffAmount)}</span> from your linked bank account.
            </p>
            <p className="text-[12px] text-[#71717a] mb-4">
              This is a one-time debit. The remaining scheduled payments will be canceled once it posts. ACH transfers typically settle in 1-2 business days.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-2 transition-colors"
              >
                {submitting ? "Initiating..." : "Yes, pay off now"}
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

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? "bg-[#15803d] text-white" : "bg-white border border-[#e4e4e7]"}`}>
      <div className={`text-[10px] uppercase tracking-[0.08em] font-semibold ${accent ? "text-white/70" : "text-[#71717a]"}`}>
        {label}
      </div>
      <div className={`mt-1 text-[18px] font-bold tabular-nums ${accent ? "text-white" : "text-[#0a0a0a]"}`}>
        {value}
      </div>
      {sub ? (
        <div className={`text-[11px] mt-0.5 ${accent ? "text-[#a3e635]" : "text-[#52525b]"}`}>{sub}</div>
      ) : null}
    </div>
  );
}

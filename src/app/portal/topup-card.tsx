"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitTopUpRequest } from "@/actions/portal-topup";

type Eligibility = {
  ok: true;
  eligible: boolean;
  originalAmount: number;
  totalRepay: number;
  paidAmount: number;
  paidRatio: number;
  thresholdRatio: number;
  maxRequestAmount: number;
  minRequestAmount: number;
  existingPending: { id: string; requestedAmount: number; createdAt: string } | null;
};

function fmtMoney(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function TopUpCard({ eligibility }: { eligibility: Eligibility }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(
    Math.min(eligibility.maxRequestAmount, Math.max(eligibility.minRequestAmount, Math.round(eligibility.originalAmount * 1.5))),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number } | null>(null);

  // Pending state — request already in review
  if (eligibility.existingPending) {
    return (
      <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafaf7] p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#0a0a0a]">Top-up request under review.</h2>
            <p className="text-[13px] text-[#52525b] mt-0.5">
              You requested <strong>{fmtMoney(eligibility.existingPending.requestedAmount)}</strong> on{" "}
              {new Date(eligibility.existingPending.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
              We'll email you once it's reviewed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Done state — just submitted
  if (done) {
    return (
      <div className="rounded-2xl border border-[#15803d] bg-[#f0fdf4] p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#15803d] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#15803d]">Request submitted.</h2>
            <p className="text-[13px] text-[#15803d]/80 mt-0.5">
              We received your request for {fmtMoney(done.amount)}. Our team will review and reach out within 1 business day.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Not yet eligible state — gentle encouragement
  if (!eligibility.eligible) {
    const pctPaid = Math.round(eligibility.paidRatio * 100);
    const pctNeeded = Math.round(eligibility.thresholdRatio * 100);
    return (
      <div className="rounded-2xl border border-dashed border-[#e4e4e7] bg-white p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fafaf7] border border-[#e4e4e7] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#52525b]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-[#0a0a0a]">Want more cash?</h2>
            <p className="text-[13px] text-[#52525b] mt-0.5">
              You'll be able to request up to <strong>{fmtMoney(eligibility.maxRequestAmount)}</strong> once you've paid {pctNeeded}% of this advance. You're at <strong>{pctPaid}%</strong> right now.
            </p>
            <div className="mt-3 h-1.5 bg-[#f4f4f5] rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-[#15803d]"
                style={{ width: `${Math.min(pctPaid, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Eligible state — request form
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const r = await submitTopUpRequest({ amount });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone({ amount: r.requestedAmount });
    setTimeout(() => router.refresh(), 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#15803d] bg-gradient-to-br from-white to-[#f0fdf4] p-6 lg:p-7 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-[#15803d] text-white text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1">
            You qualify for more
          </span>
          <h2 className="mt-3 text-[20px] font-bold tracking-tight">Need more cash? Request a bigger advance.</h2>
          <p className="mt-1.5 text-[13px] text-[#52525b] max-w-xl">
            You've paid <strong>{Math.round(eligibility.paidRatio * 100)}%</strong> of your current advance. You're eligible to request up to <strong>{fmtMoney(eligibility.maxRequestAmount)}</strong> (2× your original).
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white border border-[#e4e4e7] p-5">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#71717a]">Requested amount</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[28px] font-bold text-[#0a0a0a]">$</span>
            <input
              type="number"
              min={eligibility.minRequestAmount}
              max={eligibility.maxRequestAmount}
              step={50}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="text-[28px] font-bold text-[#0a0a0a] tabular-nums bg-transparent focus:outline-none flex-1 min-w-0"
            />
          </div>
        </label>
        <input
          type="range"
          min={eligibility.minRequestAmount}
          max={eligibility.maxRequestAmount}
          step={50}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full mt-3 accent-[#15803d]"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-[#71717a] tabular-nums">
          <span>min {fmtMoney(eligibility.minRequestAmount)}</span>
          <span>max {fmtMoney(eligibility.maxRequestAmount)}</span>
        </div>
      </div>

      <div className="mt-4 text-[12px] text-[#52525b]">
        Our team will review your request within 1 business day. We may run a soft check on your repayment history before approving.
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#15803d] hover:bg-[#166534] disabled:opacity-60 text-white text-[14px] font-semibold px-5 py-2.5 transition-colors"
      >
        {submitting ? "Submitting..." : `Request ${fmtMoney(amount)}`}
      </button>
    </form>
  );
}

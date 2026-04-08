"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MIN_AMOUNT = 500;
const MAX_AMOUNT = 10000;
const STEP_SIZE = 100;
const LOAN_TERMS = [1, 2, 3, 4, 6, 8, 12, 16]; // weeks

interface Props {
  defaultAmount?: number;
  defaultTermWeeks?: number;
  platforms?: string[];
  utmSource?: string;
  utmCampaign?: string;
  buttonText?: string;
  formTemplateSlug?: string;
}

export function LandingLeadForm({
  defaultAmount = 3000,
  defaultTermWeeks = 4,
  platforms = ["Uber", "Lyft", "Both"],
  utmSource = "lp",
  utmCampaign = "uber-lyft",
  buttonText = "Start My Application →",
  formTemplateSlug,
}: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(defaultAmount);
  const [termWeeks, setTermWeeks] = useState(defaultTermWeeks);
  const [platform, setPlatform] = useState(platforms[0] ?? "Uber");
  const [submitting, setSubmitting] = useState(false);

  const pct = ((amount - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT)) * 100;
  const weeklyEstimate = ((amount * 0.02 * Math.pow(1.02, termWeeks)) / (Math.pow(1.02, termWeeks) - 1)).toFixed(0);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const params = new URLSearchParams({
      amount: String(amount),
      term: String(termWeeks),
      platform,
      utm_source: utmSource,
      utm_campaign: utmCampaign,
    });
    if (formTemplateSlug) {
      params.set("template", formTemplateSlug);
    }
    router.push(`/apply?${params.toString()}`);
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-[#e4e4e7] overflow-hidden">
      {/* Form header */}
      <div
        className="px-6 py-5 text-white"
        style={{
          background: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#bbf7d0]">
          Loan application
        </p>
        <h3 className="text-[22px] font-extrabold tracking-[-0.02em] mt-1">
          Start your application
        </h3>
        <p className="text-[13px] text-[#bbf7d0] mt-1">
          No credit check. Takes 5 minutes.
        </p>
      </div>

      <form onSubmit={handleStart} className="p-6 space-y-6">
        {/* Loan amount slider */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold">
              Loan amount
            </label>
            <span className="text-[22px] font-extrabold text-[#15803d] tracking-[-0.02em]">
              ${amount.toLocaleString()}
            </span>
          </div>
          <div className="relative h-[6px] w-full">
            <div className="absolute inset-0 rounded-full bg-[#e5e7eb]" />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#15803d]"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 h-[20px] w-[20px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#15803d] shadow-md pointer-events-none"
              style={{ left: `${pct}%` }}
            />
            <input
              type="range"
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
              step={STEP_SIZE}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[#a1a1aa]">
            <span>${MIN_AMOUNT.toLocaleString()}</span>
            <span>${MAX_AMOUNT.toLocaleString()}</span>
          </div>
        </div>

        {/* Term selector */}
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold block mb-2">
            Repayment term
          </label>
          <div className="grid grid-cols-4 gap-2">
            {LOAN_TERMS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTermWeeks(t)}
                className={`py-2.5 rounded-lg text-[12px] font-bold transition-colors ${
                  termWeeks === t
                    ? "bg-[#15803d] text-white"
                    : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                }`}
              >
                {t} {t === 1 ? "wk" : "wks"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#a1a1aa]">Max 16 weeks (~4 months)</p>
        </div>

        {/* Platform */}
        {platforms.length > 0 && (
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold block mb-2">
              Which platform do you drive for?
            </label>
            <div className={`grid gap-2 grid-cols-${Math.min(platforms.length, 4)}`}>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`py-2.5 rounded-lg text-[13px] font-bold transition-colors ${
                    platform === p
                      ? "bg-[#15803d] text-white"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Weekly estimate */}
        <div className="bg-[#f0f5f0] rounded-[10px] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#71717a]">Estimated weekly payment</span>
            <span className="text-[18px] font-extrabold text-[#15803d]">
              ${weeklyEstimate}/wk
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[#a1a1aa]">
            Final rate depends on earnings verification
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#15803d] text-white font-extrabold text-[15px] py-4 rounded-xl hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-green-900/20"
        >
          {submitting ? "Loading application..." : buttonText}
        </button>

        <div className="flex items-center justify-center gap-4 text-[11px] text-[#71717a]">
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 1L2 3V6C2 8.5 3.7 10.5 6 11C8.3 10.5 10 8.5 10 6V3L6 1Z"
                stroke="#15803d"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Bank-grade security
          </span>
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#15803d" strokeWidth="1.5" />
              <path
                d="M3.5 6L5 7.5L8.5 4"
                stroke="#15803d"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            No credit pull
          </span>
        </div>
      </form>
    </div>
  );
}

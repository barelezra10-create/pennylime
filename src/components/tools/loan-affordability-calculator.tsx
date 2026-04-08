"use client";

import { useState } from "react";
import Link from "next/link";

const TERM_WEEKS = [1, 2, 3, 4, 6, 8, 12, 16];
const MAX_LOAN = 10000;
const WEEKLY_RATE = 0.30; // 30% weekly interest

export function LoanAffordabilityCalculator() {
  const [weeklyEarnings, setWeeklyEarnings] = useState(800);
  const [weeklyExpenses, setWeeklyExpenses] = useState(400);
  const [paymentPct, setPaymentPct] = useState(30);
  const [termWeeks, setTermWeeks] = useState(8);

  const weeklySpare = Math.max(0, weeklyEarnings - weeklyExpenses);
  const weeklyPayment = (weeklySpare * paymentPct) / 100;
  // Calculate max loan from affordable weekly payment using weekly compound interest
  const rawMax = WEEKLY_RATE > 0
    ? (weeklyPayment * (Math.pow(1 + WEEKLY_RATE, termWeeks) - 1)) / (WEEKLY_RATE * Math.pow(1 + WEEKLY_RATE, termWeeks))
    : weeklyPayment * termWeeks;
  const maxLoan = Math.min(MAX_LOAN, Math.round(rawMax / 50) * 50);
  const totalCost = weeklyPayment * termWeeks;
  const interest = totalCost - maxLoan;

  const spareRatio = weeklySpare > 0 ? paymentPct : 0;
  let affordabilityLevel: "green" | "yellow" | "red";
  let affordabilityLabel: string;
  if (spareRatio <= 30) {
    affordabilityLevel = "green";
    affordabilityLabel = "Comfortable";
  } else if (spareRatio <= 50) {
    affordabilityLevel = "yellow";
    affordabilityLabel = "Moderate";
  } else {
    affordabilityLevel = "red";
    affordabilityLabel = "Stretching";
  }

  const colorMap = {
    green: { bg: "bg-[#f0f5f0]", text: "text-[#15803d]", badge: "bg-[#dcfce7] text-[#15803d]" },
    yellow: { bg: "bg-yellow-50", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
    red: { bg: "bg-red-50", text: "text-red-600", badge: "bg-red-100 text-red-600" },
  };
  const colors = colorMap[affordabilityLevel];

  const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Weekly Gig Earnings</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{fmt(weeklyEarnings)}</span>
            </div>
            <input
              type="range" min={200} max={3000} step={50} value={weeklyEarnings}
              onChange={(e) => setWeeklyEarnings(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>$200</span><span>$3,000</span></div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Weekly Expenses</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{fmt(weeklyExpenses)}</span>
            </div>
            <input
              type="range" min={100} max={2000} step={50} value={weeklyExpenses}
              onChange={(e) => setWeeklyExpenses(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>$100</span><span>$2,000</span></div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">% of spare cash to loan payments</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{paymentPct}%</span>
            </div>
            <input
              type="range" min={10} max={50} step={5} value={paymentPct}
              onChange={(e) => setPaymentPct(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>10%</span><span>50%</span></div>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-black mb-3 block">Loan Term</label>
            <div className="grid grid-cols-4 gap-2">
              {TERM_WEEKS.map((w) => (
                <button
                  key={w}
                  onClick={() => setTermWeeks(w)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                    termWeeks === w
                      ? "bg-[#15803d] text-white shadow-sm"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {w} {w === 1 ? "wk" : "wks"}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#f4f4f5] rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] mb-2">Weekly Spare Cash</p>
            <p className="text-[22px] font-extrabold text-black">{fmt(weeklySpare)}</p>
            <p className="text-[12px] text-[#71717a]">earnings minus expenses</p>
          </div>
        </div>

        {/* Results */}
        <div className={`${colors.bg} rounded-xl p-6 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className={`${colors.badge} text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.05em]`}>
                {affordabilityLabel}
              </span>
            </div>

            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">You can afford to borrow up to</p>
              <p className={`text-[42px] font-extrabold tracking-[-0.03em] ${colors.text}`}>
                {fmt(maxLoan)}
              </p>
              {maxLoan >= MAX_LOAN && (
                <p className="text-[12px] text-[#71717a]">Capped at our $10,000 maximum</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Weekly Payment</p>
                <p className="text-[18px] font-bold text-black">{fmt(weeklyPayment)}</p>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Loan Term</p>
                <p className="text-[18px] font-bold text-black">{termWeeks} weeks</p>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Total Cost</p>
                <p className="text-[18px] font-bold text-black">{fmt(totalCost)}</p>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Weekly Interest</p>
                <p className="text-[18px] font-bold text-black">{fmt(interest)}</p>
              </div>
            </div>

            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-[12px] text-[#71717a]">
                Based on <span className="font-bold text-black">{fmt(weeklySpare)}/wk spare</span>, putting <span className="font-bold text-black">{paymentPct}%</span> toward payments = <span className="font-bold text-black">{fmt(weeklyPayment)}/wk</span> × <span className="font-bold text-black">{termWeeks} weeks</span>
              </p>
            </div>
          </div>

          <Link
            href="/apply"
            className="mt-4 bg-[#15803d] text-white text-center text-[14px] font-bold py-3.5 rounded-xl hover:bg-[#166534] transition-colors"
          >
            Apply for your {fmt(maxLoan)} loan now
          </Link>
        </div>
      </div>
    </div>
  );
}

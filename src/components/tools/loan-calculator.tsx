"use client";

import { useState } from "react";
import Link from "next/link";

const TERM_WEEKS = [1, 2, 3, 4, 6, 8, 12, 16];

function calculateWeeklyPayment(principal: number, weeklyRatePercent: number, weeks: number) {
  if (weeklyRatePercent === 0) return principal / weeks;
  const r = weeklyRatePercent / 100;
  const payment = (principal * r * Math.pow(1 + r, weeks)) / (Math.pow(1 + r, weeks) - 1);
  return payment;
}

export function LoanCalculator() {
  const [amount, setAmount] = useState(3000);
  const [weeks, setWeeks] = useState(4);
  const [weeklyRate, setWeeklyRate] = useState(30); // 30% weekly minimum

  const weekly = calculateWeeklyPayment(amount, weeklyRate, weeks);
  const total = weekly * weeks;
  const interest = total - amount;

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Loan Amount</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">${amount.toLocaleString()}</span>
            </div>
            <input type="range" min={500} max={10000} step={100} value={amount} onChange={(e) => setAmount(+e.target.value)} className="w-full accent-[#15803d]" />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>$500</span><span>$10,000</span></div>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-black mb-3 block">Repayment Term</label>
            <div className="grid grid-cols-4 gap-2">
              {TERM_WEEKS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWeeks(w)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                    weeks === w
                      ? "bg-[#15803d] text-white shadow-sm"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {w} {w === 1 ? "wk" : "wks"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-2">Max 16 weeks (~4 months)</p>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Weekly Interest Rate</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{weeklyRate}%</span>
            </div>
            <input type="range" min={25} max={50} step={1} value={weeklyRate} onChange={(e) => setWeeklyRate(+e.target.value)} className="w-full accent-[#15803d]" />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>25%/wk</span><span>50%/wk</span></div>
          </div>
        </div>

        <div className="bg-[#f0f5f0] rounded-xl p-6 flex flex-col justify-center">
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Weekly Payment</p>
            <p className="text-[42px] font-extrabold tracking-[-0.03em] text-black">${weekly.toFixed(2)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Total Interest</p>
              <p className="text-[18px] font-bold text-black">${interest.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Total Cost</p>
              <p className="text-[18px] font-bold text-black">${total.toFixed(0)}</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white/60 rounded-lg">
            <p className="text-[12px] text-[#71717a]">
              <span className="font-bold text-black">${amount.toLocaleString()}</span> over <span className="font-bold text-black">{weeks} {weeks === 1 ? "week" : "weeks"}</span> at <span className="font-bold text-black">{weeklyRate}% weekly</span>
            </p>
          </div>
          <Link
            href="/apply"
            className="mt-4 bg-[#15803d] text-white text-center text-[14px] font-bold py-3.5 rounded-xl hover:bg-[#166534] transition-colors"
          >
            Apply for This Loan
          </Link>
        </div>
      </div>
    </div>
  );
}

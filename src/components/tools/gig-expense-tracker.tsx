"use client";

import { useState } from "react";
import Link from "next/link";

interface Expense {
  key: string;
  label: string;
  defaultValue: number;
}

const EXPENSE_FIELDS: Expense[] = [
  { key: "gas", label: "Gas / Fuel", defaultValue: 280 },
  { key: "carPayment", label: "Car Payment", defaultValue: 350 },
  { key: "insurance", label: "Car Insurance", defaultValue: 180 },
  { key: "phoneBill", label: "Phone Bill", defaultValue: 80 },
  { key: "maintenance", label: "Car Maintenance", defaultValue: 80 },
  { key: "tolls", label: "Tolls", defaultValue: 40 },
  { key: "parking", label: "Parking", defaultValue: 30 },
  { key: "food", label: "Food on the Road", defaultValue: 60 },
  { key: "healthInsurance", label: "Health Insurance", defaultValue: 150 },
];

const SE_TAX_RATE = 0.153;
const INCOME_TAX_RATE = 0.12;

export function GigExpenseTracker() {
  const [grossEarnings, setGrossEarnings] = useState(3200);
  const [platformFeePct, setPlatformFeePct] = useState(25);
  const [expenses, setExpenses] = useState<Record<string, number>>(
    Object.fromEntries(EXPENSE_FIELDS.map((f) => [f.key, f.defaultValue]))
  );

  const setExpense = (key: string, val: number) =>
    setExpenses((prev) => ({ ...prev, [key]: val }));

  const platformFeeAmt = (grossEarnings * platformFeePct) / 100;
  const fixedExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const totalExpenses = fixedExpenses + platformFeeAmt;
  const netBeforeTax = grossEarnings - totalExpenses;
  const expenseRatio = grossEarnings > 0 ? (totalExpenses / grossEarnings) * 100 : 0;
  const seTax = Math.max(0, netBeforeTax * SE_TAX_RATE);
  const incomeTax = Math.max(0, netBeforeTax * INCOME_TAX_RATE);
  const totalTax = seTax + incomeTax;
  const trueHome = netBeforeTax - totalTax;

  const fmt = (n: number) => "$" + Math.round(Math.max(0, n)).toLocaleString();

  // Bar segment widths
  const expensePct = Math.min(100, expenseRatio);
  const taxPct = grossEarnings > 0 ? Math.min(100 - expensePct, (totalTax / grossEarnings) * 100) : 0;
  const homePct = Math.max(0, 100 - expensePct - taxPct);

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-5">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Monthly Gross Earnings</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{fmt(grossEarnings)}</span>
            </div>
            <input
              type="number"
              value={grossEarnings}
              onChange={(e) => setGrossEarnings(Math.max(0, +e.target.value))}
              className="w-full border border-[#e4e4e7] rounded-xl px-3 py-2.5 text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]"
              placeholder="Monthly gross earnings"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Platform Fees</label>
              <span className="text-[16px] font-extrabold text-[#15803d]">{platformFeePct}% = {fmt(platformFeeAmt)}</span>
            </div>
            <input
              type="range" min={0} max={40} step={1} value={platformFeePct}
              onChange={(e) => setPlatformFeePct(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>0%</span><span>40%</span></div>
          </div>

          <div>
            <p className="text-[14px] font-semibold text-black mb-3">Monthly Expenses</p>
            <div className="space-y-2.5">
              {EXPENSE_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <label className="text-[13px] text-[#71717a] w-40 flex-shrink-0">{f.label}</label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#71717a]">$</span>
                    <input
                      type="number"
                      value={expenses[f.key]}
                      onChange={(e) => setExpense(f.key, Math.max(0, +e.target.value))}
                      className="w-full border border-[#e4e4e7] rounded-lg pl-6 pr-3 py-2 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-[#f0f5f0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">True Take-Home</p>
              <p className="text-[42px] font-extrabold tracking-[-0.03em] text-black">{fmt(trueHome)}</p>
              <p className="text-[12px] text-[#71717a]">per month after expenses & taxes</p>
            </div>

            {/* Visual bar */}
            <div className="mb-5">
              <div className="flex rounded-full overflow-hidden h-4 mb-2">
                <div
                  className="bg-red-400 h-full transition-all"
                  style={{ width: `${expensePct}%` }}
                  title="Expenses"
                />
                <div
                  className="bg-yellow-400 h-full transition-all"
                  style={{ width: `${taxPct}%` }}
                  title="Taxes"
                />
                <div
                  className="bg-[#15803d] h-full transition-all"
                  style={{ width: `${homePct}%` }}
                  title="Take-home"
                />
              </div>
              <div className="flex gap-4 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Expenses {expenseRatio.toFixed(0)}%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Taxes {grossEarnings > 0 ? ((totalTax / grossEarnings) * 100).toFixed(0) : 0}%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#15803d] inline-block" /> Keep {homePct.toFixed(0)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Total Expenses</p>
                <p className="text-[18px] font-bold text-black">{fmt(totalExpenses)}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Net Before Tax</p>
                <p className="text-[18px] font-bold text-black">{fmt(netBeforeTax)}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">SE Tax (15.3%)</p>
                <p className="text-[18px] font-bold text-black">{fmt(seTax)}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Tax Set-Aside</p>
                <p className="text-[18px] font-bold text-black">{fmt(totalTax)}</p>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Expense Ratio</p>
              <p className="text-[22px] font-extrabold text-black">{expenseRatio.toFixed(1)}%</p>
              <p className="text-[11px] text-[#71717a]">of gross goes to expenses</p>
            </div>
          </div>

          <Link
            href="/apply"
            className="mt-4 bg-[#15803d] text-white text-center text-[14px] font-bold py-3.5 rounded-xl hover:bg-[#166534] transition-colors"
          >
            Short on operating costs? PennyLime funds gig workers in 48 hours
          </Link>
        </div>
      </div>
    </div>
  );
}

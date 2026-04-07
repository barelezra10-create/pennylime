"use client";

import { useState } from "react";
import Link from "next/link";

type FilingStatus = "single" | "mfj" | "hoh";

// 2024 federal income tax brackets (simplified)
const BRACKETS: Record<FilingStatus, { rate: number; upTo: number }[]> = {
  single: [
    { rate: 0.10, upTo: 11600 },
    { rate: 0.12, upTo: 47150 },
    { rate: 0.22, upTo: 100525 },
    { rate: 0.24, upTo: Infinity },
  ],
  mfj: [
    { rate: 0.10, upTo: 23200 },
    { rate: 0.12, upTo: 94300 },
    { rate: 0.22, upTo: 201050 },
    { rate: 0.24, upTo: Infinity },
  ],
  hoh: [
    { rate: 0.10, upTo: 16550 },
    { rate: 0.12, upTo: 63100 },
    { rate: 0.22, upTo: 100500 },
    { rate: 0.24, upTo: Infinity },
  ],
};

const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 14600,
  mfj: 29200,
  hoh: 21900,
};

function calcFederalTax(taxableIncome: number, status: FilingStatus): number {
  if (taxableIncome <= 0) return 0;
  const brackets = BRACKETS[status];
  let tax = 0;
  let prev = 0;
  for (const bracket of brackets) {
    const slice = Math.min(taxableIncome, bracket.upTo) - prev;
    if (slice <= 0) break;
    tax += slice * bracket.rate;
    prev = bracket.upTo;
    if (taxableIncome <= bracket.upTo) break;
  }
  return tax;
}

export function TaxEstimator() {
  const [grossEarnings, setGrossEarnings] = useState("");
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [deductions, setDeductions] = useState("");

  const gross = parseFloat(grossEarnings) || 0;
  const businessDeductions = parseFloat(deductions) || 0;
  const netEarnings = Math.max(0, gross - businessDeductions);

  // Self-employment tax (15.3% on 92.35% of net earnings)
  const seTaxBase = netEarnings * 0.9235;
  const selfEmploymentTax = seTaxBase * 0.153;

  // SE tax deduction (half of SE tax)
  const seTaxDeduction = selfEmploymentTax / 2;

  // Federal income tax
  const standardDeduction = STANDARD_DEDUCTION[filingStatus];
  const taxableIncome = Math.max(0, netEarnings - seTaxDeduction - standardDeduction);
  const federalIncomeTax = calcFederalTax(taxableIncome, filingStatus);

  const totalTax = selfEmploymentTax + federalIncomeTax;
  const quarterlyPayment = totalTax / 4;
  const monthlySetAside = totalTax / 12;
  const effectiveRate = gross > 0 ? (totalTax / gross) * 100 : 0;

  const hasData = gross > 0;

  return (
    <div className="bg-white rounded-[10px] p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-5">
          <div>
            <label className="text-[13px] font-medium text-[#1a1a1a] mb-2 block">
              Annual Gig Earnings
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a] text-[14px]">
                $
              </span>
              <input
                type="number"
                min={0}
                value={grossEarnings}
                onChange={(e) => setGrossEarnings(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 border border-[#e4e4e7] rounded-lg text-[14px] text-[#1a1a1a] focus:outline-none focus:border-[#15803d] focus:ring-1 focus:ring-[#15803d]"
              />
            </div>
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#1a1a1a] mb-2 block">
              Filing Status
            </label>
            <select
              value={filingStatus}
              onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
              className="w-full px-4 py-2.5 border border-[#e4e4e7] rounded-lg text-[14px] text-[#1a1a1a] bg-white focus:outline-none focus:border-[#15803d] focus:ring-1 focus:ring-[#15803d]"
            >
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="hoh">Head of Household</option>
            </select>
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#1a1a1a] mb-2 block">
              Estimated Business Deductions
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a] text-[14px]">
                $
              </span>
              <input
                type="number"
                min={0}
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 border border-[#e4e4e7] rounded-lg text-[14px] text-[#1a1a1a] focus:outline-none focus:border-[#15803d] focus:ring-1 focus:ring-[#15803d]"
              />
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-1">
              Mileage, phone, equipment, etc.
            </p>
          </div>
        </div>

        <div className="bg-[#f0f5f0] rounded-[10px] p-6 flex flex-col justify-center">
          {!hasData ? (
            <p className="text-[13px] text-[#71717a] text-center">
              Enter your earnings to estimate your tax liability.
            </p>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                  Estimated Annual Tax
                </p>
                <p className="text-[42px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
                  ${totalTax.toFixed(0)}
                </p>
                <p className="text-[12px] text-[#71717a]">
                  Effective rate: {effectiveRate.toFixed(1)}%
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                    Quarterly Payment
                  </p>
                  <p className="text-[18px] font-bold text-[#1a1a1a]">
                    ${quarterlyPayment.toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                    Monthly Set-Aside
                  </p>
                  <p className="text-[18px] font-bold text-[#1a1a1a]">
                    ${monthlySetAside.toFixed(0)}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 border border-[#d1e8d9] text-[12px] text-[#71717a] mb-4 space-y-1">
                <div className="flex justify-between">
                  <span>Self-employment tax</span>
                  <span className="text-[#1a1a1a] font-medium">${selfEmploymentTax.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Federal income tax</span>
                  <span className="text-[#1a1a1a] font-medium">${federalIncomeTax.toFixed(0)}</span>
                </div>
              </div>

              <p className="text-[11px] text-[#a1a1aa] mb-2">
                Estimates only. Consult a tax professional for advice.
              </p>
            </>
          )}

          <Link
            href="/apply"
            className="mt-2 bg-[#15803d] text-white text-center text-[13px] font-medium py-3 rounded-lg hover:bg-[#166534] transition-colors"
          >
            Ready to Apply?
          </Link>
        </div>
      </div>
    </div>
  );
}

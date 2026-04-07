"use client";

import { useState } from "react";
import Link from "next/link";

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[13px] font-medium text-[#1a1a1a] mb-2 block">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a] text-[14px]">
          $
        </span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full pl-7 pr-4 py-2.5 border border-[#e4e4e7] rounded-lg text-[14px] text-[#1a1a1a] focus:outline-none focus:border-[#15803d] focus:ring-1 focus:ring-[#15803d]"
        />
      </div>
    </div>
  );
}

type Zone = "good" | "caution" | "high";

function getZone(dti: number): Zone {
  if (dti < 36) return "good";
  if (dti <= 43) return "caution";
  return "high";
}

const zoneConfig: Record<Zone, { color: string; bg: string; label: string; guidance: string }> = {
  good: {
    color: "#15803d",
    bg: "#f0f5f0",
    label: "Good",
    guidance:
      "Your debt-to-income ratio is healthy. Lenders generally view DTI under 36% favorably, and you likely qualify for most loan products.",
  },
  caution: {
    color: "#d97706",
    bg: "#fffbeb",
    label: "Caution",
    guidance:
      "Your DTI is in a moderate range. Some lenders may still approve you, but reducing existing debts before applying can improve your chances.",
  },
  high: {
    color: "#dc2626",
    bg: "#fef2f2",
    label: "High Risk",
    guidance:
      "Your DTI is above 43%, which many lenders consider high risk. Consider paying down existing debts or increasing income before applying.",
  },
};

export function DtiCalculator() {
  const [income, setIncome] = useState("");
  const [rent, setRent] = useState("");
  const [car, setCar] = useState("");
  const [other, setOther] = useState("");

  const monthlyIncome = parseFloat(income) || 0;
  const totalDebts =
    (parseFloat(rent) || 0) + (parseFloat(car) || 0) + (parseFloat(other) || 0);

  const dti = monthlyIncome > 0 ? (totalDebts / monthlyIncome) * 100 : 0;
  const zone = getZone(dti);
  const config = zoneConfig[zone];
  const hasData = monthlyIncome > 0;

  return (
    <div className="bg-white rounded-[10px] p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <CurrencyInput label="Monthly Income" value={income} onChange={setIncome} />
          <CurrencyInput label="Monthly Rent / Mortgage" value={rent} onChange={setRent} />
          <CurrencyInput label="Monthly Car Payment" value={car} onChange={setCar} />
          <CurrencyInput label="Other Monthly Debts" value={other} onChange={setOther} />
        </div>

        <div
          className="rounded-[10px] p-6 flex flex-col justify-center"
          style={{ backgroundColor: hasData ? config.bg : "#f0f5f0" }}
        >
          {!hasData ? (
            <p className="text-[13px] text-[#71717a] text-center">
              Enter your monthly income to see your DTI ratio.
            </p>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                  Debt-to-Income Ratio
                </p>
                <p
                  className="text-[52px] font-extrabold tracking-[-0.03em]"
                  style={{ color: config.color }}
                >
                  {dti.toFixed(1)}%
                </p>
                <span
                  className="inline-block text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: config.color }}
                >
                  {config.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-[13px]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                    Monthly Income
                  </p>
                  <p className="font-bold text-[#1a1a1a]">${monthlyIncome.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                    Total Debts
                  </p>
                  <p className="font-bold text-[#1a1a1a]">${totalDebts.toFixed(0)}</p>
                </div>
              </div>

              <p className="text-[12px] text-[#71717a] mb-4 leading-relaxed">{config.guidance}</p>
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

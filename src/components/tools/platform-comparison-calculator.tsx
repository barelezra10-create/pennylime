"use client";

import { useState } from "react";
import Link from "next/link";

interface Platform {
  id: string;
  name: string;
  category: string;
  grossPerHour: number;
  costPerMile: number;
  milesPerHour: number;
}

const PLATFORMS: Platform[] = [
  { id: "uber", name: "Uber", category: "Rideshare", grossPerHour: 22, costPerMile: 0.58, milesPerHour: 15 },
  { id: "lyft", name: "Lyft", category: "Rideshare", grossPerHour: 20, costPerMile: 0.58, milesPerHour: 15 },
  { id: "doordash", name: "DoorDash", category: "Delivery", grossPerHour: 18, costPerMile: 0.45, milesPerHour: 20 },
  { id: "ubereats", name: "Uber Eats", category: "Delivery", grossPerHour: 17, costPerMile: 0.45, milesPerHour: 20 },
  { id: "instacart", name: "Instacart", category: "Shopping", grossPerHour: 16, costPerMile: 0.30, milesPerHour: 12 },
  { id: "amazon", name: "Amazon Flex", category: "Delivery", grossPerHour: 25, costPerMile: 0.50, milesPerHour: 22 },
  { id: "grubhub", name: "Grubhub", category: "Delivery", grossPerHour: 17, costPerMile: 0.45, milesPerHour: 20 },
  { id: "taskrabbit", name: "TaskRabbit", category: "Services", grossPerHour: 28, costPerMile: 0.10, milesPerHour: 5 },
];

export function PlatformComparisonCalculator() {
  const [hoursPerWeek, setHoursPerWeek] = useState(25);
  const [selected, setSelected] = useState<string[]>(["uber", "doordash", "amazon"]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id]
    );
  };

  const activePlatforms = PLATFORMS.filter((p) => selected.includes(p.id));

  const calcNet = (p: Platform) => {
    const expPerHour = p.costPerMile * p.milesPerHour;
    return p.grossPerHour - expPerHour;
  };

  const bestId = activePlatforms.length > 0
    ? activePlatforms.reduce((a, b) => calcNet(a) > calcNet(b) ? a : b).id
    : null;

  const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-[#e4e4e7]">
      {/* Hours slider */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <label className="text-[14px] font-semibold text-black">Hours per Week</label>
          <span className="text-[18px] font-extrabold text-[#15803d]">{hoursPerWeek}h/week</span>
        </div>
        <input
          type="range" min={5} max={60} step={1} value={hoursPerWeek}
          onChange={(e) => setHoursPerWeek(+e.target.value)}
          className="w-full accent-[#15803d]"
        />
        <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>5h</span><span>60h</span></div>
      </div>

      {/* Platform toggles */}
      <div className="mb-6">
        <p className="text-[14px] font-semibold text-black mb-3">Select Platforms to Compare</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`px-3 py-2 rounded-lg text-[12px] font-bold transition-colors border ${
                selected.includes(p.id)
                  ? "bg-[#15803d] text-white border-[#15803d]"
                  : "bg-white text-[#71717a] border-[#e4e4e7] hover:border-[#15803d]"
              }`}
            >
              {p.name}
              <span className="ml-1 opacity-60 font-normal text-[11px]">{p.category}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Comparison cards */}
      {activePlatforms.length === 0 ? (
        <div className="text-center py-8 text-[#71717a] text-[14px]">Select at least one platform above</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePlatforms.map((p) => {
            const netPerHour = calcNet(p);
            const grossWeekly = p.grossPerHour * hoursPerWeek;
            const expenseWeekly = p.costPerMile * p.milesPerHour * hoursPerWeek;
            const netWeekly = netPerHour * hoursPerWeek;
            const grossMonthly = grossWeekly * 4.33;
            const netMonthly = netWeekly * 4.33;
            const isBest = p.id === bestId;

            return (
              <div
                key={p.id}
                className={`rounded-xl p-5 border-2 transition-all ${
                  isBest
                    ? "border-[#15803d] bg-[#f0f5f0]"
                    : "border-[#e4e4e7] bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[15px] font-extrabold text-black">{p.name}</p>
                    <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">{p.category}</p>
                  </div>
                  {isBest && (
                    <span className="bg-[#15803d] text-white text-[10px] font-bold px-2 py-1 rounded-full">
                      BEST
                    </span>
                  )}
                </div>

                <div className="mb-3">
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Net per Hour</p>
                  <p className="text-[28px] font-extrabold tracking-[-0.03em] text-black">{fmt(netPerHour)}/hr</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <p className="text-[#71717a]">Gross/wk</p>
                    <p className="font-bold text-black">{fmt(grossWeekly)}</p>
                  </div>
                  <div>
                    <p className="text-[#71717a]">Net/wk</p>
                    <p className={`font-bold ${isBest ? "text-[#15803d]" : "text-black"}`}>{fmt(netWeekly)}</p>
                  </div>
                  <div>
                    <p className="text-[#71717a]">Gross/mo</p>
                    <p className="font-bold text-black">{fmt(grossMonthly)}</p>
                  </div>
                  <div>
                    <p className="text-[#71717a]">Net/mo</p>
                    <p className={`font-bold ${isBest ? "text-[#15803d]" : "text-black"}`}>{fmt(netMonthly)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[#71717a]">Est. expenses/wk</p>
                    <p className="font-bold text-red-500">-{fmt(expenseWeekly)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-[#e4e4e7]">
        <Link
          href="/apply"
          className="block w-full bg-[#15803d] text-white text-center text-[14px] font-bold py-3.5 rounded-xl hover:bg-[#166534] transition-colors"
        >
          Multi-platform driver? PennyLime verifies all your gig income
        </Link>
      </div>
    </div>
  );
}

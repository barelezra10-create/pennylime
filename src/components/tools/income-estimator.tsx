"use client";

import { useState } from "react";
import Link from "next/link";

const PLATFORMS = [
  { id: "uber", label: "Uber", rate: 18 },
  { id: "lyft", label: "Lyft", rate: 17 },
  { id: "doordash", label: "DoorDash", rate: 16 },
  { id: "instacart", label: "Instacart", rate: 15 },
  { id: "amazon-flex", label: "Amazon Flex", rate: 19 },
  { id: "grubhub", label: "Grubhub", rate: 15 },
  { id: "fiverr", label: "Fiverr", rate: 22 },
  { id: "upwork", label: "Upwork", rate: 28 },
  { id: "taskrabbit", label: "TaskRabbit", rate: 25 },
];

export function IncomeEstimator() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["uber"]));
  const [hours, setHours] = useState(20);

  const togglePlatform = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const activePlatforms = PLATFORMS.filter((p) => selected.has(p.id));
  const avgRate =
    activePlatforms.length > 0
      ? activePlatforms.reduce((sum, p) => sum + p.rate, 0) / activePlatforms.length
      : 0;

  const weeklyEarnings = avgRate * hours;
  const monthlyEarnings = weeklyEarnings * 4.33;
  const annualEarnings = weeklyEarnings * 52;

  const loanMin = activePlatforms.length > 0 ? 100 : 0;
  const loanMax = Math.min(10000, Math.round(annualEarnings * 0.2));

  return (
    <div className="bg-white rounded-[10px] p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="text-[13px] font-medium text-[#1a1a1a] mb-3 block">
              Gig Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                    selected.has(p.id)
                      ? "bg-[#15803d] text-white border-[#15803d]"
                      : "bg-white text-[#71717a] border-[#e4e4e7] hover:border-[#15803d] hover:text-[#15803d]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {activePlatforms.length > 0 && (
              <p className="text-[11px] text-[#71717a] mt-2">
                Avg rate: ${avgRate.toFixed(0)}/hr across {activePlatforms.length} platform
                {activePlatforms.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[13px] font-medium text-[#1a1a1a]">Hours per Week</label>
              <span className="text-[16px] font-extrabold text-[#15803d]">{hours}h</span>
            </div>
            <input
              type="range"
              min={5}
              max={80}
              step={1}
              value={hours}
              onChange={(e) => setHours(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1">
              <span>5h</span>
              <span>80h</span>
            </div>
          </div>
        </div>

        <div className="bg-[#f0f5f0] rounded-[10px] p-6 flex flex-col justify-center">
          {activePlatforms.length === 0 ? (
            <p className="text-[13px] text-[#71717a] text-center">
              Select at least one platform to see your estimate.
            </p>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">
                  Weekly Earnings
                </p>
                <p className="text-[36px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
                  ${weeklyEarnings.toFixed(0)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Monthly</p>
                  <p className="text-[18px] font-bold text-[#1a1a1a]">
                    ${monthlyEarnings.toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Annual</p>
                  <p className="text-[18px] font-bold text-[#1a1a1a]">
                    ${annualEarnings.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 mb-4 border border-[#d1e8d9]">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] mb-1">
                  Eligible Loan Range
                </p>
                <p className="text-[15px] font-bold text-[#15803d]">
                  ${loanMin.toLocaleString()} - ${loanMax.toLocaleString()}
                </p>
              </div>
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

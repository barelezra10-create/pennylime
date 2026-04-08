"use client";

import { useState } from "react";
import Link from "next/link";

const CITIES: { name: string; baseMultiplier: number }[] = [
  { name: "New York", baseMultiplier: 1.45 },
  { name: "Los Angeles", baseMultiplier: 1.3 },
  { name: "Chicago", baseMultiplier: 1.25 },
  { name: "Houston", baseMultiplier: 1.1 },
  { name: "Phoenix", baseMultiplier: 1.0 },
  { name: "Philadelphia", baseMultiplier: 1.2 },
  { name: "San Antonio", baseMultiplier: 0.95 },
  { name: "San Diego", baseMultiplier: 1.15 },
  { name: "Dallas", baseMultiplier: 1.05 },
  { name: "Miami", baseMultiplier: 1.35 },
  { name: "Atlanta", baseMultiplier: 1.1 },
  { name: "Denver", baseMultiplier: 1.15 },
  { name: "Seattle", baseMultiplier: 1.3 },
  { name: "Portland", baseMultiplier: 1.2 },
  { name: "Austin", baseMultiplier: 1.1 },
];

const VEHICLE_TYPES: { name: string; multiplier: number }[] = [
  { name: "Economy", multiplier: 1.0 },
  { name: "Comfort", multiplier: 1.3 },
  { name: "XL", multiplier: 1.5 },
  { name: "Black", multiplier: 2.2 },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKEND_DAYS = ["Sat", "Sun"];

const BASE_FARE = 3.0;
const PER_MILE = 1.1;
const PER_MINUTE = 0.2;
const AVG_TRIP_MINUTES = 15;
const AVG_TRIP_MILES = 5;
const TRIPS_PER_HOUR = 2.5;
const WEEKEND_MULTIPLIER = 1.3;
const GAS_PER_MILE = 0.15;
const MAINTENANCE_PER_MILE = 0.08;
const MONTHLY_INSURANCE = 200;
const MONTHLY_PHONE = 50;

export function UberEarningsCalculator() {
  const [cityIdx, setCityIdx] = useState(0);
  const [hoursPerWeek, setHoursPerWeek] = useState(25);
  const [vehicleIdx, setVehicleIdx] = useState(0);
  const [selectedDays, setSelectedDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  const city = CITIES[cityIdx];
  const vehicle = VEHICLE_TYPES[vehicleIdx];

  const weekdayCount = selectedDays.filter((d) => !WEEKEND_DAYS.includes(d)).length;
  const weekendCount = selectedDays.filter((d) => WEEKEND_DAYS.includes(d)).length;
  const totalDays = selectedDays.length || 1;

  // weighted surge multiplier
  const weightedSurge =
    (weekdayCount * 1.0 + weekendCount * WEEKEND_MULTIPLIER) / totalDays;

  const tripEarnings =
    BASE_FARE +
    PER_MILE * AVG_TRIP_MILES +
    PER_MINUTE * AVG_TRIP_MINUTES;

  const grossPerHour =
    tripEarnings * TRIPS_PER_HOUR * city.baseMultiplier * vehicle.multiplier * weightedSurge;

  const hoursPerDay = hoursPerWeek / totalDays;
  const milesPerHour = AVG_TRIP_MILES * TRIPS_PER_HOUR;
  const milesPerWeek = milesPerHour * hoursPerWeek;

  const grossWeekly = grossPerHour * hoursPerWeek;
  const grossMonthly = grossWeekly * 4.33;
  const grossYearly = grossWeekly * 52;

  const gasWeekly = GAS_PER_MILE * milesPerWeek;
  const maintenanceWeekly = MAINTENANCE_PER_MILE * milesPerWeek;
  const insuranceWeekly = MONTHLY_INSURANCE / 4.33;
  const phoneWeekly = MONTHLY_PHONE / 4.33;
  const totalExpensesWeekly = gasWeekly + maintenanceWeekly + insuranceWeekly + phoneWeekly;

  const netWeekly = grossWeekly - totalExpensesWeekly;
  const netMonthly = netWeekly * 4.33;
  const netYearly = netWeekly * 52;
  const netHourly = hoursPerWeek > 0 ? netWeekly / hoursPerWeek : 0;

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const fmt = (n: number) =>
    "$" + Math.round(n).toLocaleString();

  return (
    <div className="bg-white rounded-xl p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <label className="text-[14px] font-semibold text-black mb-2 block">City</label>
            <select
              value={cityIdx}
              onChange={(e) => setCityIdx(+e.target.value)}
              className="w-full border border-[#e4e4e7] rounded-xl px-3 py-2.5 text-[14px] text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#15803d]"
            >
              {CITIES.map((c, i) => (
                <option key={c.name} value={i}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[14px] font-semibold text-black">Hours per Week</label>
              <span className="text-[18px] font-extrabold text-[#15803d]">{hoursPerWeek}h</span>
            </div>
            <input
              type="range" min={5} max={60} step={1} value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(+e.target.value)}
              className="w-full accent-[#15803d]"
            />
            <div className="flex justify-between text-[11px] text-[#a1a1aa] mt-1"><span>5h</span><span>60h</span></div>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-black mb-3 block">Vehicle Type</label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_TYPES.map((v, i) => (
                <button
                  key={v.name}
                  onClick={() => setVehicleIdx(i)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                    vehicleIdx === i
                      ? "bg-[#15803d] text-white shadow-sm"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[14px] font-semibold text-black mb-3 block">Days Driving</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-2 rounded-lg text-[12px] font-bold transition-colors ${
                    selectedDays.includes(day)
                      ? WEEKEND_DAYS.includes(day)
                        ? "bg-[#15803d] text-white"
                        : "bg-[#15803d] text-white"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {day}
                  {WEEKEND_DAYS.includes(day) && (
                    <span className="ml-1 text-[10px] opacity-75">1.3x</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-2">Weekends earn 1.3x surge multiplier</p>
          </div>
        </div>

        {/* Results */}
        <div className="bg-[#f0f5f0] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Est. Hourly (after expenses)</p>
              <p className="text-[42px] font-extrabold tracking-[-0.03em] text-black">{fmt(netHourly)}/hr</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Gross Weekly</p>
                <p className="text-[18px] font-bold text-black">{fmt(grossWeekly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Net Weekly</p>
                <p className="text-[18px] font-bold text-[#15803d]">{fmt(netWeekly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Gross Monthly</p>
                <p className="text-[18px] font-bold text-black">{fmt(grossMonthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Net Monthly</p>
                <p className="text-[18px] font-bold text-[#15803d]">{fmt(netMonthly)}</p>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-3 mb-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] mb-2">Monthly Expenses Estimate</p>
              <div className="space-y-1">
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#71717a]">Gas</span>
                  <span className="font-semibold text-black">{fmt(gasWeekly * 4.33)}/mo</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#71717a]">Maintenance</span>
                  <span className="font-semibold text-black">{fmt(maintenanceWeekly * 4.33)}/mo</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#71717a]">Insurance</span>
                  <span className="font-semibold text-black">{fmt(MONTHLY_INSURANCE)}/mo</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#71717a]">Phone</span>
                  <span className="font-semibold text-black">{fmt(MONTHLY_PHONE)}/mo</span>
                </div>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] mb-1">Yearly Net Income</p>
              <p className="text-[22px] font-extrabold text-black">{fmt(netYearly)}/yr</p>
            </div>
          </div>

          <Link
            href="/apply"
            className="mt-4 bg-[#15803d] text-white text-center text-[14px] font-bold py-3.5 rounded-xl hover:bg-[#166534] transition-colors"
          >
            Need cash for car repairs? Apply for a PennyLime loan
          </Link>
        </div>
      </div>
    </div>
  );
}

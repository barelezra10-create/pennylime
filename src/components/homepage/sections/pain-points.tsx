"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const PAIN_POINTS = [
  {
    title: "Vehicle broke down",
    desc: "Your car is your business. Transmission, tires, engine repair. No car means no deliveries, no rides, no income. Get funded same-day to get back on the road.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M18 6 L22 10 L15 17 L11 13 Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 13 L5 19 L9 23 L15 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "New equipment needed",
    desc: "Better phone, insulated delivery bags, car phone mount, dash cam. The right gear means more orders, better ratings, and higher tips. Invest in your hustle.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="8" y="3" width="12" height="22" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M12 21 H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Gas and mileage costs",
    desc: "Fuel prices spike, mileage adds up, oil changes can't wait. Your operating costs don't pause when the app is slow. Bridge the gap until your next payout.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M4 24 V8 L8 4 H16 L20 8 V24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 12 H24 V20 H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="8" y="10" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    title: "Insurance payment due",
    desc: "Commercial auto insurance, liability coverage, health insurance. These bills don't flex with your earnings. Stay covered so you can keep working.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M14 3 L4 7 V14 C4 20 8 25 14 27 C20 25 24 20 24 14 V7 L14 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14 L13 17 L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Slow season cash flow",
    desc: "January slump, bad weather week, platform algorithm change. Revenue dips but business costs stay fixed. A short-term loan keeps your operation running smooth.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M4 20 L10 14 L14 18 L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 8 H24 V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Expand to a new platform",
    desc: "Adding DoorDash, starting on Amazon Flex, renting a Turo car. Scaling your gig business takes upfront capital. We fund your growth, not just survival.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M14 9 V19 M9 14 H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function PainPoints() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !cardsRef.current) return;
    const ctx = gsap.context(() => {
      const cards = cardsRef.current?.querySelectorAll(".pain-card");
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 75%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-white py-24 md:py-32 px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="max-w-2xl mb-14">
          <div className="inline-flex items-center gap-2 bg-[#fef9ec] text-[#b45309] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
            Business expenses
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5"
            style={{ fontSize: "clamp(38px, 5.5vw, 68px)" }}
          >
            Your gig business
            <br />
            <span className="text-[#15803d]">needs capital.</span>
          </h2>
          <p className="text-[#71717a] text-[17px] leading-relaxed max-w-xl">
            Running a gig business means real expenses. Vehicle repairs,
            equipment, fuel, insurance. When costs come before your next
            payout, we bridge the gap.
          </p>
        </div>

        {/* Pain point cards */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {PAIN_POINTS.map((point, i) => (
            <div
              key={i}
              className="pain-card group bg-[#faf8f0] hover:bg-[#f0f5f0] rounded-2xl p-6 transition-all duration-300 border border-transparent hover:border-[#15803d]/20"
            >
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-[#15803d] mb-4 shadow-sm group-hover:scale-105 transition-transform">
                {point.icon}
              </div>
              <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-black mb-2">
                {point.title}
              </h3>
              <p className="text-[#71717a] text-[14px] leading-relaxed">
                {point.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 flex flex-wrap items-center gap-6">
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white font-semibold text-[15px] px-8 py-4 rounded-xl hover:bg-[#166534] transition-colors shadow-lg shadow-green-900/20"
          >
            Fund my business
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <p className="text-[#71717a] text-[14px]">
            <span className="font-semibold text-black">48-hour funding</span>{" "}
            · No credit check · 1099 income verified
          </p>
        </div>
      </div>
    </section>
  );
}

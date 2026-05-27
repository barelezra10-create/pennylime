"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const PAIN_POINTS = [
  {
    title: "Vehicle down for repairs",
    desc: "Transmission, tires, engine work. A car off the road means zero Uber, Lyft, or DoorDash income. Funded in 48 hours so you stop bleeding days.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M18 6 L22 10 L15 17 L11 13 Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 13 L5 19 L9 23 L15 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Inventory or gear upgrade",
    desc: "FBA reorder, Shopify holiday stock, a better phone, insulated delivery bag, dash cam. The gear pays for itself in higher orders and ratings.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="8" y="3" width="12" height="22" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M12 21 H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Gas and mileage costs",
    desc: "Fuel spikes, oil changes, brakes. Operating costs don't pause when the app is slow. Bridge the gap until your next platform payout.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M4 24 V8 L8 4 H16 L20 8 V24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 12 H24 V20 H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="8" y="10" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    title: "Insurance and licensing",
    desc: "Commercial auto, liability, seller permits. These bills don't flex with a soft week. Stay covered, stay active on the platform.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M14 3 L4 7 V14 C4 20 8 25 14 27 C20 25 24 20 24 14 V7 L14 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14 L13 17 L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Slow week cash flow",
    desc: "January slump, weather week, platform algorithm change. Revenue dips, fixed costs stay. A short advance keeps you operating until volume returns.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M4 20 L10 14 L14 18 L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 8 H24 V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Expand to a new platform",
    desc: "Adding Amazon Flex, starting on Instacart, listing a Turo car. Scaling takes upfront capital. We fund growth, not just survival.",
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
    <section ref={sectionRef} className="bg-white py-16 md:py-32 px-5 md:px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="max-w-2xl mb-10 md:mb-14">
          <div className="inline-flex items-center gap-2 bg-[#fefce8] text-[#92400e] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
            Where the money goes
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5"
            style={{ fontSize: "clamp(34px, 5.5vw, 68px)" }}
          >
            Real costs.
            <br />
            <span className="text-[#15803d]">Real funding.</span>
          </h2>
          <p className="text-[#52525b] text-[16px] md:text-[17px] leading-relaxed max-w-xl">
            Drivers, sellers, and operators all run a real business. Vehicle repairs, FBA inventory, gear, insurance. When the cost lands before the next payout, we bridge it.
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
              className="pain-card group bg-[#fafaf7] hover:bg-[#f0fdf4] rounded-2xl p-6 transition-all duration-300 border border-transparent hover:border-[#15803d]/20"
            >
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-[#15803d] mb-4 shadow-sm group-hover:scale-105 transition-transform">
                {point.icon}
              </div>
              <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-black mb-2">
                {point.title}
              </h3>
              <p className="text-[#52525b] text-[14px] leading-relaxed">
                {point.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 md:mt-14 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-6">
          <Link
            href="/apply"
            className="inline-flex items-center justify-center gap-2 bg-[#15803d] text-white font-semibold text-[15px] px-6 min-h-[48px] py-3 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)] w-full sm:w-auto"
          >
            Get funded
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
          <p className="text-[#52525b] text-[14px]">
            <span className="font-semibold text-black">48-hour funding</span>{" "}
            · No credit pull · Verified 1099 deposits, not pay stubs
          </p>
        </div>
      </div>
    </section>
  );
}

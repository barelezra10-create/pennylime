"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    num: "01",
    headline: "Apply in 5 minutes",
    desc: "Short form. No tax returns, no pay stubs. Just the platforms your 1099 income comes from and basic info. We never pull your credit.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="3" width="20" height="26" rx="3" />
        <path d="M11 9h10M11 15h10M11 21h6" />
      </svg>
    ),
  },
  {
    num: "02",
    headline: "We read 90 days of deposits",
    desc: "Connect your bank securely through Plaid. We size the advance to your verified Uber, DoorDash, Amazon, or Shopify deposits, not a FICO score.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="26" height="18" rx="3" />
        <path d="M3 13h26M9 19h4M16 19h4" />
      </svg>
    ),
  },
  {
    num: "03",
    headline: "Funded in 48 hours",
    desc: "Approved offer with the factor rate and total cost on one screen. Funds in your bank within 48 hours. Repaid as a small percentage of future deposits.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4v20M9 17l7 7 7-7" />
        <path d="M5 28h22" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !cardsRef.current) return;
    const ctx = gsap.context(() => {
      const cards = cardsRef.current?.querySelectorAll(".step-card");
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 70%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#0a0a0a] py-20 md:py-36 px-5 md:px-6 overflow-hidden"
    >
      {/* Background dot grid + soft lime glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #a3e635 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#15803d] opacity-[0.08] blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="max-w-2xl mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 bg-[#15803d]/15 text-[#a3e635] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.06em] uppercase border border-[#15803d]/30">
            How it works
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-white"
            style={{ fontSize: "clamp(34px, 5.5vw, 68px)" }}
          >
            Three steps
            <br />
            to <span className="text-[#a3e635]">funded.</span>
          </h2>
        </div>

        {/* Steps grid: vertical stack on mobile, horizontal on md+ */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 relative">
          {/* Connecting line between cards on desktop */}
          <div className="hidden md:block absolute top-[88px] left-[16%] right-[16%] h-px bg-gradient-to-r from-[#15803d]/0 via-[#15803d]/40 to-[#15803d]/0 z-0" />

          {STEPS.map((step) => (
            <div
              key={step.num}
              className="step-card relative bg-[#141414] border border-white/10 rounded-3xl p-7 md:p-8 hover:border-[#15803d]/40 hover:bg-[#171717] transition-colors"
            >
              {/* Icon + step number row */}
              <div className="flex items-start justify-between mb-7">
                <div className="w-14 h-14 rounded-2xl bg-[#15803d]/15 border border-[#15803d]/30 flex items-center justify-center text-[#a3e635]">
                  {step.icon}
                </div>
                <span className="font-extrabold tracking-[-0.06em] text-[#a3e635]/30 leading-none select-none text-[64px]">
                  {step.num}
                </span>
              </div>

              <h3 className="font-extrabold tracking-[-0.025em] text-white leading-tight mb-3 text-[22px] md:text-[24px]">
                {step.headline}
              </h3>
              <p className="text-[#a1a1aa] text-[14.5px] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        {/* CTA + supporting line */}
        <div className="mt-16 md:mt-20 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <p className="text-[#a1a1aa] text-[15px] leading-relaxed max-w-md">
            Apply with the platforms you already drive, deliver, or sell on. We do the rest.
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center justify-center gap-2 bg-[#15803d] text-white font-semibold text-[15px] px-6 sm:px-7 min-h-[48px] py-3.5 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_8px_20px_-8px_rgba(21,128,61,0.6)] w-full sm:w-auto"
          >
            Start your application
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
        </div>
      </div>
    </section>
  );
}

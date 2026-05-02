"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="14" r="11" />
        <path d="M5.5 5.5l17 17" />
      </svg>
    ),
    title: "No credit checks",
    desc: "We never pull your credit. We size advances from 90 days of verified bank deposits across the platforms you actually earn on.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="14" r="11" />
        <path d="M14 7v7l5 3" />
      </svg>
    ),
    title: "Same-day decisions",
    desc: "Most applicants get a decision within 1 to 3 hours. Funds in your bank within 48 hours after acceptance.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="6" width="20" height="16" rx="2" />
        <path d="M4 11h20M9 16h4" />
      </svg>
    ),
    title: "Built for 1099",
    desc: "Designed from day one for drivers, sellers, and operators. Platform earnings are our specialty, not an afterthought.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="14" r="10" />
        <path d="M14 8v12M11 11h4.5a2 2 0 010 4h-3a2 2 0 000 4H17" />
      </svg>
    ),
    title: "Transparent pricing",
    desc: "Plain factor rate. Total dollar cost shown above the fold before you accept. No hidden fees, no asterisks.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="10" height="22" rx="2" />
        <path d="M12 6h4M14 22h.01" />
      </svg>
    ),
    title: "Mobile-first apply",
    desc: "Apply from your phone between rides, deliveries, or orders. The form takes 5 minutes and works on any device.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 14a10.5 10.5 0 0118-7.4M24.5 14a10.5 10.5 0 01-18 7.4" />
        <path d="M21 3v5h-5M7 25v-5h5" />
      </svg>
    ),
    title: "Repeat funding",
    desc: "Completed your first advance? Reapply instantly with better terms. We reward consistent performers.",
  },
];

export function WhyLimecredit() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      const cards = sectionRef.current!.querySelectorAll(".feature-card");
      gsap.fromTo(
        Array.from(cards),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-[#fafaf7] py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 md:mb-14 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white border border-[#dcfce7] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.06em] uppercase shadow-sm">
            Why us
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#0a0a0a]"
            style={{ fontSize: "clamp(32px, 5vw, 60px)" }}
          >
            Why <span className="text-[#15803d]">PennyLime<span>.</span></span>
          </h2>
          <p className="text-[#52525b] text-[16px] md:text-[17px] mt-5 leading-relaxed">
            We built the product we wished existed when we drove gig for the first time.
            Six things that are intentional, not accidental.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card group bg-white rounded-2xl p-6 border border-[#e4e4e7] hover:border-[#15803d]/40 hover:shadow-[0_12px_30px_-12px_rgba(21,128,61,0.18)] transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-[#dcfce7] text-[#15803d] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                {f.icon}
              </div>
              <h3 className="font-extrabold text-[#0a0a0a] text-[17px] mb-2 tracking-[-0.02em]">
                {f.title}
              </h3>
              <p className="text-[#52525b] text-[14px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

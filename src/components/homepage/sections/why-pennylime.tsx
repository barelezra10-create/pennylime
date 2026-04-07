"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    icon: (
      <Image
        src="/illustrations/why-no-credit-check.png"
        alt="No credit check illustration"
        width={56}
        height={56}
        className="w-14 h-14 object-contain"
      />
    ),
    title: "No credit checks",
    desc: "We never pull your credit score. We evaluate income and cash flow from your platform earnings instead.",
  },
  {
    icon: (
      <Image
        src="/illustrations/why-fast-funding.png"
        alt="Fast funding illustration"
        width={56}
        height={56}
        className="w-14 h-14 object-contain"
      />
    ),
    title: "Same-day decisions",
    desc: "Most applications get a decision within hours. No waiting days for a bank to call you back.",
  },
  {
    icon: (
      <Image
        src="/illustrations/why-built-for-1099.png"
        alt="Built for 1099 workers illustration"
        width={56}
        height={56}
        className="w-14 h-14 object-contain"
      />
    ),
    title: "Built for 1099",
    desc: "Designed from day one for independent contractors. Your gig income is our specialty, not an afterthought.",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {/* Dollar in circle */}
        <circle cx="20" cy="20" r="14" stroke="#15803d" strokeWidth="2.5" />
        <path d="M20 10 L20 30M15 14 C15 14 16 12 20 12 C24 12 25 15 25 16 C25 20 15 19 15 24 C15 28 17 28 20 28 C23 28 25 26 25 26" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Transparent pricing",
    desc: "Clear rates, no hidden fees. You know exactly what you&apos;ll pay before you accept. No surprises.",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {/* Phone */}
        <rect x="12" y="4" width="16" height="32" rx="4" stroke="#15803d" strokeWidth="2.5" />
        <path d="M18 32 L22 32" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M16 10 L24 10" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: "Mobile-first apply",
    desc: "Apply from your phone between rides or deliveries. Our form takes 5 minutes and works on any device.",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {/* Repeat/refresh */}
        <path d="M8 20 C8 12.3 14.3 6 22 6 C26.4 6 30.3 8 32.8 11.2" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M28 6 L33 11 L28 16" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 20 C32 27.7 25.7 34 18 34 C13.6 34 9.7 32 7.2 28.8" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M12 34 L7 29 L12 24" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Repeat borrowing",
    desc: "Paid off your first loan? Reapply instantly with better terms. We reward reliability.",
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
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 60%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-[#faf8f0] py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 bg-white text-[#15803d] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase shadow-sm">
            Why us
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a]"
            style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
          >
            Why PennyLime.
          </h2>
          <p className="text-[#71717a] text-[16px] mt-4 max-w-xl">
            We built the product we wish existed when we drove gig for the first
            time. Everything here is intentional.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card bg-white rounded-2xl p-6 border border-[#e4e4e7] hover:border-[#15803d]/30 hover:shadow-lg transition-all duration-200"
            >
              <div className="mb-4">{f.icon}</div>
              <h3 className="font-bold text-[#1a1a1a] text-[16px] mb-2 tracking-[-0.02em]">
                {f.title}
              </h3>
              <p className="text-[#71717a] text-[14px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

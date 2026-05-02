"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const weDoRef = useRef<HTMLDivElement>(null);
  const screenRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

  useEffect(() => {
    if (!sectionRef.current || !pinRef.current) return;
    // Skip the pinned scroll-trigger on mobile, as it is jarring on small viewports.
    // Instead, render a static stacked layout below md.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    const ctx = gsap.context(() => {
      gsap.set(screenRefs[0].current, { opacity: 1 });
      gsap.set([screenRefs[1].current, screenRefs[2].current, screenRefs[3].current, screenRefs[4].current], { opacity: 0 });
      gsap.set(problemRef.current, { opacity: 1 });
      gsap.set(weDoRef.current, { opacity: 0, y: 30 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=300%",
          pin: pinRef.current,
          pinSpacing: true,
          scrub: 1,
        },
      });

      tl.to(problemRef.current, { opacity: 0, y: -20, duration: 0.5 }, 0.3);

      tl.to(screenRefs[0].current, { opacity: 0, duration: 0.3 }, 0.5)
        .to(screenRefs[1].current, { opacity: 1, duration: 0.3 }, 0.5);

      tl.to(screenRefs[1].current, { opacity: 0, duration: 0.3 }, 1.2)
        .to(screenRefs[2].current, { opacity: 1, duration: 0.3 }, 1.2);

      tl.to(screenRefs[2].current, { opacity: 0, duration: 0.3 }, 1.9)
        .to(screenRefs[3].current, { opacity: 1, duration: 0.3 }, 1.9);

      tl.to(screenRefs[3].current, { opacity: 0, duration: 0.3 }, 2.6)
        .to(screenRefs[4].current, { opacity: 1, duration: 0.3 }, 2.6);

      tl.to(weDoRef.current, { opacity: 1, y: 0, duration: 0.6 }, 3.2);

    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative md:h-[400vh]"
    >
      <div
        ref={pinRef}
        className="bg-[#fafaf7] flex items-center overflow-hidden md:h-screen"
      >
        <div className="max-w-6xl mx-auto w-full px-5 md:px-6 py-16 md:py-0 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">

          {/* Mobile: render Problem + WhatWeDo stacked, both fully visible.
              Desktop: absolutely positioned and animated on scroll. */}
          <div className="relative md:min-h-[300px]">
            <div ref={problemRef} className="md:absolute md:inset-0 mb-10 md:mb-0">
              <div className="inline-flex items-center gap-2 bg-[#fef2f2] text-[#dc2626] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                The Problem
              </div>
              <h2 className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5" style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>
                Banks don&apos;t get
                <br />
                platform work.
              </h2>
              <div className="space-y-4">
                <p className="text-[#52525b] text-[16px] flex items-start gap-3">
                  <span className="text-[#dc2626] text-[18px] mt-0.5">&#10005;</span>
                  <span><strong className="text-black">Underwriting wants a W-2.</strong> Drivers, sellers, and operators don&apos;t have one.</span>
                </p>
                <p className="text-[#52525b] text-[16px] flex items-start gap-3">
                  <span className="text-[#dc2626] text-[18px] mt-0.5">&#10005;</span>
                  <span><strong className="text-black">44% of small operators</strong> never apply because they assume the answer is no.</span>
                </p>
              </div>
            </div>

            <div ref={weDoRef} className="md:absolute md:inset-0 md:opacity-0">
              <div className="inline-flex items-center gap-2 bg-[#dcfce7] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                What We Do
              </div>
              <h2 className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5" style={{ fontSize: "clamp(36px, 6vw, 80px)" }}>
                We Do
              </h2>
              <div className="space-y-4">
                <p className="text-[#52525b] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">We read 90 days of verified deposits</strong>, not your credit score.</span>
                </p>
                <p className="text-[#52525b] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">$500 to $10,000</strong> for vehicle repairs, FBA inventory, gear, and gap weeks.</span>
                </p>
                <p className="text-[#52525b] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">Funded in 48 hours.</strong> Apply in 5 minutes, decision same day.</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <PhoneMockup screenRefs={screenRefs} />
          </div>

          {/* Mobile-only: a tiny static teaser of the 3 most-important screens
              under the phone, since the scroll-pinned cycle is disabled. */}
          <div className="md:hidden -mt-4 flex flex-wrap justify-center gap-3">
            {[
              { label: "Apply", caption: "5 minutes" },
              { label: "Verify", caption: "Plaid, read-only" },
              { label: "Approved", caption: "in 48 hours" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex-1 min-w-[100px] bg-white border border-[#e4e4e7] rounded-2xl px-3 py-3 text-center"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#15803d]">
                  {s.label}
                </div>
                <div className="text-[12px] text-[#52525b] mt-1 leading-tight">
                  {s.caption}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

function PhoneMockup({ screenRefs }: { screenRefs: React.RefObject<HTMLDivElement | null>[] }) {
  return (
    <div className="relative" style={{ width: 280, height: 580 }}>
      <div
        className="absolute inset-0 rounded-[44px] bg-[#0a0a0a] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35),0_0_0_2px_rgba(0,0,0,0.06)]"
        style={{ padding: 12 }}
      >
        <div className="relative w-full h-full rounded-[34px] bg-white overflow-hidden">
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 pt-3 pb-2 text-[11px] font-semibold text-black">
            <span>9:41</span>
            <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-[80px] h-[18px] bg-black rounded-full" />
            <div className="flex items-center gap-1">
              <span className="text-[10px]">100%</span>
              <div className="w-5 h-2.5 border border-black rounded-[3px] relative">
                <div className="absolute inset-0.5 bg-black rounded-[1px]" />
              </div>
            </div>
          </div>

          <div ref={screenRefs[0]} className="absolute inset-0 pt-12 px-5">
            <ScreenForm />
          </div>
          <div ref={screenRefs[1]} className="absolute inset-0 pt-12 px-5 hidden md:block">
            <ScreenSubmitting />
          </div>
          <div ref={screenRefs[2]} className="absolute inset-0 pt-12 px-5 hidden md:block">
            <ScreenVerifying />
          </div>
          <div ref={screenRefs[3]} className="absolute inset-0 pt-12 px-5 hidden md:block">
            <ScreenReviewing />
          </div>
          <div ref={screenRefs[4]} className="absolute inset-0 pt-12 px-5 hidden md:block">
            <ScreenApproved />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenForm() {
  return (
    <div className="h-full flex flex-col">
      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#a1a1aa] mb-1">Apply</p>
      <h3 className="text-[20px] font-extrabold tracking-[-0.02em] text-black leading-tight mb-5">
        How much do you need?
      </h3>
      <div className="space-y-3">
        <div className="border border-[#e4e4e7] rounded-xl p-3">
          <p className="text-[10px] text-[#a1a1aa] mb-1">Advance amount</p>
          <p className="text-[16px] font-bold text-black">$5,000</p>
        </div>
        <div className="border border-[#e4e4e7] rounded-xl p-3">
          <p className="text-[10px] text-[#a1a1aa] mb-1">Purpose</p>
          <p className="text-[14px] text-black">Vehicle repair</p>
        </div>
        <div className="border border-[#e4e4e7] rounded-xl p-3">
          <p className="text-[10px] text-[#a1a1aa] mb-1">Remit from</p>
          <p className="text-[14px] text-black">Daily deposits</p>
        </div>
      </div>
      <div className="mt-auto mb-6">
        <div className="bg-[#15803d] text-white rounded-xl py-3.5 text-center text-[14px] font-bold">
          Continue
        </div>
      </div>
    </div>
  );
}

function ScreenSubmitting() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 rounded-full border-[3px] border-[#e4e4e7]" />
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#15803d] animate-spin" />
      </div>
      <p className="text-[15px] font-bold text-black mb-1">Submitting application</p>
      <p className="text-[12px] text-[#71717a]">Securely encrypting your data</p>
    </div>
  );
}

function ScreenVerifying() {
  return (
    <div className="h-full flex flex-col">
      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#a1a1aa] mb-1">Step 2 of 3</p>
      <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-black leading-tight mb-4">
        Verifying deposits
      </h3>
      <div className="space-y-2.5">
        {[
          { name: "Uber", amount: "$2,840", status: true },
          { name: "DoorDash", amount: "$1,920", status: true },
          { name: "Instacart", amount: "$1,150", status: true },
          { name: "Lyft", amount: "...", status: false },
        ].map((row) => (
          <div key={row.name} className="flex items-center justify-between border border-[#e4e4e7] rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${row.status ? "bg-[#15803d] text-white" : "bg-[#e4e4e7] text-[#a1a1aa]"}`}>
                {row.status ? "✓" : "…"}
              </div>
              <span className="text-[13px] font-semibold text-black">{row.name}</span>
            </div>
            <span className="text-[12px] text-[#71717a] tabular-nums">{row.amount}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 bg-[#dcfce7] rounded-xl p-3">
        <p className="text-[10px] text-[#15803d] font-bold mb-0.5">Verified deposits (30d)</p>
        <p className="text-[18px] font-extrabold text-black tabular-nums">$5,910</p>
      </div>
    </div>
  );
}

function ScreenReviewing() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-2">
      <div className="relative w-20 h-20 mb-5">
        <div className="absolute inset-0 rounded-full bg-[#fefce8]" />
        <div className="absolute inset-0 flex items-center justify-center text-[28px]">⚡</div>
      </div>
      <p className="text-[15px] font-bold text-black mb-1">Reviewing your application</p>
      <p className="text-[12px] text-[#71717a] mb-5">Decision in under 60 seconds</p>
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2 text-[12px] text-black">
          <span className="text-[#15803d]">✓</span> Identity verified
        </div>
        <div className="flex items-center gap-2 text-[12px] text-black">
          <span className="text-[#15803d]">✓</span> Deposits confirmed
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#71717a]">
          <span className="text-[#a1a1aa]">○</span> Final review in progress
        </div>
      </div>
    </div>
  );
}

function ScreenApproved() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="relative w-20 h-20 mb-4">
        <div className="absolute inset-0 rounded-full bg-[#dcfce7]" />
        <div className="absolute inset-0 flex items-center justify-center text-[#15803d] text-[36px] font-bold">✓</div>
      </div>
      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#15803d] mb-1">Approved</p>
      <p className="text-[28px] font-extrabold tracking-[-0.02em] text-black tabular-nums mb-1">$5,000</p>
      <p className="text-[12px] text-[#71717a] mb-5">Funded to your bank in 48 hours</p>
      <div className="w-full space-y-2.5">
        <div className="flex items-center justify-between border border-[#e4e4e7] rounded-xl px-3 py-2.5">
          <span className="text-[12px] text-[#71717a]">Factor rate</span>
          <span className="text-[13px] font-bold text-black tabular-nums">1.30</span>
        </div>
        <div className="flex items-center justify-between border border-[#e4e4e7] rounded-xl px-3 py-2.5">
          <span className="text-[12px] text-[#71717a]">Daily remittance</span>
          <span className="text-[13px] font-bold text-black tabular-nums">7%</span>
        </div>
      </div>
    </div>
  );
}

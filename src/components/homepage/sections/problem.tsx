"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        leftRef.current,
        { opacity: 0, x: -60 },
        {
          opacity: 1,
          x: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
            end: "top 30%",
            toggleActions: "play none none reverse",
          },
        }
      );

      gsap.fromTo(
        rightRef.current,
        { opacity: 0, x: 60 },
        {
          opacity: 1,
          x: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
            end: "top 30%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center bg-white px-6 py-24 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        {/* Left: text */}
        <div ref={leftRef}>
          <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 text-[11px] font-semibold px-3 py-1.5 rounded-full mb-6 tracking-[0.04em] uppercase">
            The problem
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a] mb-8"
            style={{ fontSize: "clamp(40px, 5.5vw, 72px)" }}
          >
            Banks don&apos;t get
            <br />
            gig work.
          </h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="mt-1 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2l6 6M8 2L2 8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[#71717a] text-[16px] leading-relaxed">
                <span className="font-bold text-[#1a1a1a]">73% of gig workers</span> say traditional loans are completely inaccessible to them, rejected for lacking W-2s or pay stubs.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2l6 6M8 2L2 8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[#71717a] text-[16px] leading-relaxed">
                <span className="font-bold text-[#1a1a1a]">44% of SMBs</span> don&apos;t even apply because they assume denial before they start.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 w-5 h-5 rounded-full bg-[#dcfce7] flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 5l2.5 2.5L8.5 2" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[#71717a] text-[16px] leading-relaxed">
                <span className="font-bold text-[#1a1a1a]">PennyLime reads your earnings</span>, not your credit score. We built this for how you actually work.
              </p>
            </div>
          </div>
        </div>

        {/* Right: illustration */}
        <div ref={rightRef} className="flex items-center justify-center">
          <Image
            src="/illustrations/problem-closed-door.png"
            alt="Gig worker excluded from traditional bank, closed door illustration"
            width={400}
            height={400}
            className="w-full max-w-[400px] h-auto object-contain"
          />
        </div>
      </div>
    </section>
  );
}

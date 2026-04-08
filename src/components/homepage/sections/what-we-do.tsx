"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function WhatWeDo() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        leftRef.current,
        { opacity: 0, x: -40 },
        {
          opacity: 1, x: 0, duration: 0.8, ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 70%", toggleActions: "play none none reverse" },
        }
      );
      gsap.fromTo(
        rightRef.current,
        { opacity: 0, x: 40 },
        {
          opacity: 1, x: 0, duration: 0.8, ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 70%", toggleActions: "play none none reverse" },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-[#f0fdf4] py-20 md:py-28 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left: open door image */}
        <div ref={rightRef} className="flex justify-center md:order-1">
          <div className="relative w-full max-w-[400px] aspect-square">
            <Image
              src="/illustrations/open-door.png"
              alt="Open door representing opportunity with PennyLime"
              fill
              className="object-contain"
              sizes="(min-width: 768px) 400px, 100vw"
            />
          </div>
        </div>

        {/* Right: text */}
        <div ref={leftRef} className="md:order-2">
          <div className="inline-flex items-center gap-2 bg-[#15803d] text-white text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
            What we do
          </div>

          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-6"
            style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
          >
            We open
            <br />
            <span className="text-[#15803d]">the door.</span>
          </h2>

          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[#15803d] flex items-center justify-center mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8.5L6.5 11L12 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <p className="text-[16px] font-bold text-black">We verify your gig earnings, not your credit</p>
                <p className="text-[14px] text-[#52525b] mt-1">Connect your Uber, Lyft, DoorDash, or any platform account. We look at what you actually earn.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[#15803d] flex items-center justify-center mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8.5L6.5 11L12 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <p className="text-[16px] font-bold text-black">$100 to $10,000 for business expenses</p>
                <p className="text-[14px] text-[#52525b] mt-1">Vehicle repairs, equipment, gas, insurance, inventory. Whatever keeps your gig business running.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[#15803d] flex items-center justify-center mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8.5L6.5 11L12 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <p className="text-[16px] font-bold text-black">Funded in 48 hours</p>
                <p className="text-[14px] text-[#52525b] mt-1">Apply in 5 minutes, get a decision same day, cash in your account within 48 hours.</p>
              </div>
            </div>
          </div>

          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#166534] transition-colors shadow-lg shadow-green-900/20 mt-8"
          >
            Apply now
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

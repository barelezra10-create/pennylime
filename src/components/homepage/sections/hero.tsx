"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctasRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const limeRef = useRef<HTMLImageElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(eyebrowRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 })
        .fromTo(headlineRef.current, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.85 }, "-=0.25")
        .fromTo(subtitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.5")
        .fromTo(ctasRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, "-=0.4")
        .fromTo(statsRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55 }, "-=0.35");

      // Lime entrance: scale + slight rotate from rest
      gsap.fromTo(
        limeRef.current,
        { opacity: 0, scale: 0.85, rotate: -6 },
        { opacity: 1, scale: 1, rotate: 0, duration: 1.1, ease: "expo.out", delay: 0.1 }
      );

      // Lime gentle parallax on scroll
      if (limeRef.current) {
        gsap.to(limeRef.current, {
          y: -40,
          rotate: 4,
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center bg-[#fafaf7] overflow-hidden px-6 pt-24 pb-16"
    >
      {/* Background atmosphere: subtle dot grid + green glow behind lime */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #15803d 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute top-[10%] right-[-10%] w-[680px] h-[680px] rounded-full bg-[#dcfce7] opacity-50 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-15%] w-[460px] h-[460px] rounded-full bg-[#bef264] opacity-25 blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto w-full relative z-10 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
        {/* LEFT: copy */}
        <div>
          <div
            ref={eyebrowRef}
            className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-[#dcfce7] text-[#15803d] text-[12px] font-bold px-3 py-1.5 rounded-full mb-7 tracking-[0.06em] uppercase shadow-sm"
          >
            <span className="w-1.5 h-1.5 bg-[#15803d] rounded-full inline-block" />
            Funding for the on-demand economy
          </div>

          <div ref={headlineRef}>
            <h1
              className="font-extrabold tracking-[-0.04em] leading-[0.92] text-[#0a0a0a] mb-6"
              style={{ fontSize: "clamp(48px, 7.5vw, 96px)" }}
            >
              Funding for
              <br />
              drivers, sellers,
              <br />
              and <span className="text-[#15803d]">operators<span>.</span></span>
            </h1>
          </div>

          <p
            ref={subtitleRef}
            className="text-[#52525b] text-[17px] md:text-[18px] leading-relaxed max-w-xl mb-10"
          >
            If you drive for Uber, deliver for DoorDash, sell on Amazon, or run a
            shop on Shopify, your bank deposits are your credit. We read 90 days
            of verified earnings and fund you in 48 hours.{" "}
            <strong className="text-[#0a0a0a]">$100 to $10,000.</strong>
          </p>

          <div ref={ctasRef} className="flex flex-wrap gap-3 mb-12">
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 bg-[#15803d] text-white font-semibold text-[15px] px-7 py-3.5 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_8px_20px_-8px_rgba(21,128,61,0.55)]"
            >
              See what you qualify for
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
            <Link
              href="/status"
              className="inline-flex items-center gap-2 bg-white border border-[#e4e4e7] text-[#0a0a0a] font-semibold text-[15px] px-7 py-3.5 rounded-xl hover:border-[#0a0a0a] transition-colors"
            >
              Check status
            </Link>
          </div>

          {/* Stats: brand-book card style */}
          <div ref={statsRef} className="flex flex-wrap gap-3">
            {[
              { value: "60M", label: "Americans on platforms" },
              { value: "90d", label: "of deposits underwritten" },
              { value: "48h", label: "from app to funded" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white border border-[#e4e4e7] rounded-2xl px-4 py-3 min-w-[140px]"
              >
                <div className="font-extrabold text-[#0a0a0a] text-[22px] tracking-[-0.025em] tabular-nums leading-none">
                  {s.value}
                </div>
                <div className="text-[11px] text-[#71717a] uppercase tracking-[0.06em] mt-1.5 font-semibold">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: the lime mark, dramatic */}
        <div className="relative flex items-center justify-center">
          <div className="relative w-full aspect-square max-w-[640px]">
            {/* soft halo behind lime */}
            <div className="absolute inset-[10%] rounded-full bg-[#bef264] opacity-30 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={limeRef}
              src="/lime-mark.svg"
              alt="PennyLime"
              className="relative w-full h-full object-contain drop-shadow-[0_30px_60px_rgba(21,128,61,0.25)]"
            />
            {/* Floating "Approved" pill near top-right of lime */}
            <div className="absolute top-[14%] right-[6%] hidden md:block">
              <div className="bg-white rounded-2xl border border-[#dcfce7] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)] px-4 py-3 rotate-[3deg]">
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#15803d]">Approved</div>
                <div className="font-extrabold text-[#0a0a0a] text-[20px] tabular-nums tracking-[-0.025em] leading-none mt-1">$3,000</div>
                <div className="text-[10px] text-[#71717a] mt-1">7% of daily deposits</div>
              </div>
            </div>
            {/* Floating "Verified" pill near bottom-left */}
            <div className="absolute bottom-[16%] left-[2%] hidden md:block">
              <div className="bg-white rounded-2xl border border-[#dcfce7] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)] px-4 py-3 -rotate-[4deg]">
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#15803d]">Verified income</div>
                <div className="font-extrabold text-[#0a0a0a] text-[20px] tabular-nums tracking-[-0.025em] leading-none mt-1">$5,910</div>
                <div className="text-[10px] text-[#71717a] mt-1">Uber · DoorDash · Instacart</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-[#71717a] font-semibold uppercase tracking-[0.18em] hidden md:flex flex-col items-center gap-1.5">
        <span>Scroll</span>
        <span className="w-px h-6 bg-gradient-to-b from-[#71717a] to-transparent" />
      </div>
    </section>
  );
}

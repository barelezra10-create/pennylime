"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const HERO_ILLUSTRATIONS = [
  { src: "/illustrations/hero-gig-worker.png", alt: "Delivery rider on a bicycle" },
  { src: "/illustrations/platform-rideshare.png", alt: "Rideshare driver" },
  { src: "/illustrations/platform-delivery.png", alt: "Food delivery courier" },
  { src: "/illustrations/platform-shopping.png", alt: "Personal shopper" },
  { src: "/illustrations/platform-freelance.png", alt: "Freelance creative at laptop" },
];

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctasRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  // Cycle through illustrations every 3.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_ILLUSTRATIONS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      // Initial fade-in stagger
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        headlineRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.9 }
      )
        .fromTo(
          subtitleRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.7 },
          "-=0.5"
        )
        .fromTo(
          ctasRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6 },
          "-=0.4"
        )
        .fromTo(
          statsRef.current,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.6 },
          "-=0.3"
        );

      // Draw SVG squiggle on scroll
      if (pathRef.current) {
        const length = pathRef.current.getTotalLength();
        gsap.set(pathRef.current, {
          strokeDasharray: length,
          strokeDashoffset: length,
        });
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: "top 80%",
          end: "top 30%",
          scrub: 0.6,
          onUpdate: (self) => {
            if (pathRef.current) {
              gsap.set(pathRef.current, {
                strokeDashoffset: length * (1 - self.progress),
              });
            }
          },
        });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex flex-col justify-center bg-[#faf8f0] relative overflow-hidden px-6"
    >
      {/* Background blob */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[#f0f5f0] opacity-60 blur-3xl" />
        <div className="absolute bottom-[-5%] left-[-8%] w-[400px] h-[400px] rounded-full bg-[#d1fae5] opacity-30 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto w-full relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left column */}
        <div>
        {/* Label */}
        <div className="inline-flex items-center gap-2 bg-[#dcfce7] text-[#15803d] text-[12px] font-semibold px-3 py-1.5 rounded-full mb-8 tracking-[0.03em]">
          <span className="w-1.5 h-1.5 bg-[#15803d] rounded-full inline-block" />
          Fast funding for gig workers
        </div>

        {/* Headline */}
        <div ref={headlineRef} className="relative">
          <h1
            className="font-extrabold tracking-[-0.04em] leading-[0.92] text-[#1a1a1a] mb-0"
            style={{ fontSize: "clamp(60px, 10vw, 120px)" }}
          >
            Get funded.
            <br />
            Keep moving.
          </h1>
          {/* Hand-drawn squiggle underline */}
          <svg
            className="mt-2 mb-8"
            width="420"
            height="22"
            viewBox="0 0 420 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              ref={pathRef}
              d="M4 14 C 30 4, 60 20, 90 12 S 150 2, 180 14 S 240 24, 270 12 S 330 2, 360 14 S 400 20, 416 10"
              stroke="#15803d"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-[#71717a] text-[18px] leading-relaxed max-w-xl mb-10"
        >
          Business cash advances for gig workers and 1099 contractors. $100 -
          $10,000 for vehicle repairs, equipment, inventory, and operating
          costs. Verified by your earnings, not your credit score.
        </p>

        {/* CTAs */}
        <div ref={ctasRef} className="flex flex-wrap gap-4 mb-14">
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white font-semibold text-[15px] px-8 py-4 rounded-xl hover:bg-[#166534] transition-colors shadow-lg shadow-green-900/20"
          >
            Get Funded Now
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link
            href="/status"
            className="inline-flex items-center gap-2 border-2 border-[#1a1a1a] text-[#1a1a1a] font-semibold text-[15px] px-8 py-4 rounded-xl hover:bg-[#1a1a1a] hover:text-white transition-colors"
          >
            Check Status
          </Link>
        </div>

        {/* Stats row */}
        <div
          ref={statsRef}
          className="flex flex-wrap gap-6 items-center text-[#71717a] text-[14px]"
        >
          {[
            { value: "$2M+", label: "funded" },
            { value: "1,200+", label: "workers" },
            { value: "48h", label: "funding" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-extrabold text-[#1a1a1a] text-[18px] tracking-tight">
                {s.value}
              </span>
              <span>{s.label}</span>
              {i < 2 && (
                <span className="ml-4 text-[#d4d4d8]">·</span>
              )}
            </div>
          ))}
        </div>
        </div>{/* end left column */}

        {/* Right column: cycling illustrations */}
        <div className="hidden md:flex items-center justify-center">
          <div className="relative w-full max-w-[480px] aspect-square">
            {HERO_ILLUSTRATIONS.map((ill, i) => (
              <Image
                key={ill.src}
                src={ill.src}
                alt={ill.alt}
                fill
                sizes="(min-width: 768px) 480px, 0px"
                className={`object-contain drop-shadow-xl transition-opacity duration-700 ease-in-out ${
                  i === heroIndex ? "opacity-100" : "opacity-0"
                }`}
                priority={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

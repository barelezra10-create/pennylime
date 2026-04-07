"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function FinalCta() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const btnRef = useRef<HTMLAnchorElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !pinRef.current) return;
    const ctx = gsap.context(() => {
      // Pin the section briefly
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=40%",
        pin: pinRef.current,
        pinSpacing: true,
        anticipatePin: 1,
      });

      // Elements converge to center on scroll
      gsap.fromTo(
        headlineRef.current,
        { opacity: 0, y: 80, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
            end: "top 40%",
            scrub: 0.8,
          },
        }
      );
      gsap.fromTo(
        subRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
            end: "top 30%",
            scrub: 0.8,
          },
        }
      );
      gsap.fromTo(
        btnRef.current,
        { opacity: 0, scale: 0.8 },
        {
          opacity: 1,
          scale: 1,
          ease: "back.out(1.4)",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 60%",
            end: "top 20%",
            scrub: 0.8,
          },
        }
      );
      gsap.fromTo(
        arrowRef.current,
        { opacity: 0, x: -30, y: 30 },
        {
          opacity: 1,
          x: 0,
          y: 0,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 55%",
            end: "top 15%",
            scrub: 0.8,
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "140vh" }}>
      <div
        ref={pinRef}
        className="h-screen flex items-center justify-center overflow-hidden relative"
        style={{
          background: "linear-gradient(135deg, #15803d 0%, #166534 50%, #14532d 100%)",
        }}
      >
        {/* Background texture blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-[#4ade80]/10 blur-3xl" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <h2
            ref={headlineRef}
            className="font-extrabold tracking-[-0.04em] leading-[0.92] text-white mb-6"
            style={{ fontSize: "clamp(56px, 9vw, 110px)", opacity: 0 }}
          >
            Ready to get
            <br />
            funded?
          </h2>

          <p
            ref={subRef}
            className="text-[#bbf7d0] text-[18px] leading-relaxed max-w-xl mx-auto mb-10"
            style={{ opacity: 0 }}
          >
            Join 1,200+ gig workers who funded their business expenses. Apply in 5 minutes.
          </p>

          {/* CTA + hand-drawn arrow */}
          <div className="relative inline-block">
            {/* Hand-drawn arrow pointing to button */}
            <div
              ref={arrowRef}
              className="absolute -left-28 top-1/2 -translate-y-1/2 hidden md:block"
              style={{ opacity: 0 }}
              aria-hidden="true"
            >
              <svg width="110" height="80" viewBox="0 0 110 80" fill="none">
                <path
                  d="M8 58 C 20 30, 45 18, 75 32 C 85 37, 92 44, 96 50"
                  stroke="#bbf7d0"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M88 42 L96 50 L88 58"
                  stroke="#bbf7d0"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>

            <Link
              ref={btnRef}
              href="/apply"
              className="inline-flex items-center gap-3 bg-white text-[#15803d] font-extrabold text-[18px] px-10 py-5 rounded-2xl hover:bg-[#f0fdf4] transition-colors shadow-2xl"
              style={{ opacity: 0 }}
            >
              Apply Now
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {/* Micro reassurance */}
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-[#86efac] text-[13px]">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7l3 3 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              No credit check
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7l3 3 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              5 minute application
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7l3 3 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Same-day decisions
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

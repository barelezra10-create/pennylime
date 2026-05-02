"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * Each platform: brand color + stylized wordmark approximation.
 * Generic styling, not trademark reproduction.
 */
type Platform = {
  name: string;
  display: string;
  color: string;
  bg?: string;
  weight?: number;
  letterSpacing?: string;
  italic?: boolean;
  font?: string;
};

const PLATFORMS: Platform[] = [
  // Drivers
  { name: "Uber", display: "Uber", color: "#000000", weight: 800, letterSpacing: "-0.04em" },
  { name: "Lyft", display: "lyft", color: "#FF00BF", weight: 800, letterSpacing: "-0.04em" },
  { name: "DoorDash", display: "DoorDash", color: "#EB1700", weight: 800, letterSpacing: "-0.025em" },
  { name: "Instacart", display: "Instacart", color: "#43B02A", weight: 700, letterSpacing: "-0.015em" },
  { name: "Amazon Flex", display: "amazon flex", color: "#FF9900", weight: 600, letterSpacing: "-0.01em" },
  { name: "Grubhub", display: "Grubhub", color: "#F63440", weight: 800, letterSpacing: "-0.025em" },
  { name: "Shipt", display: "shipt", color: "#1A8757", weight: 800, letterSpacing: "-0.015em" },
  { name: "Postmates", display: "Postmates", color: "#000000", weight: 800, letterSpacing: "-0.025em" },

  // Sellers
  { name: "Amazon FBA", display: "amazon", color: "#FF9900", weight: 700, letterSpacing: "-0.015em" },
  { name: "Shopify", display: "shopify", color: "#5E8E3E", weight: 700, letterSpacing: "-0.015em" },
  { name: "Etsy", display: "Etsy", color: "#F1641E", weight: 800, italic: true, letterSpacing: "-0.025em" },

  // Operators
  { name: "Fiverr", display: "fiverr.", color: "#1DBF73", weight: 800, letterSpacing: "-0.04em" },
  { name: "Upwork", display: "Upwork", color: "#14A800", weight: 700, letterSpacing: "-0.015em" },
  { name: "TaskRabbit", display: "TaskRabbit", color: "#2C8C26", weight: 700, letterSpacing: "-0.02em" },
  { name: "Thumbtack", display: "thumbtack", color: "#009FD9", weight: 700, letterSpacing: "-0.015em" },
  { name: "Rover", display: "rover", color: "#0F8E61", weight: 800, letterSpacing: "-0.025em" },
  { name: "Turo", display: "Turo", color: "#593CFB", weight: 800, letterSpacing: "-0.04em" },
];

interface PlatformShowcaseProps {
  platforms: { name: string; slug: string }[];
}

export function PlatformShowcase({ platforms: _platforms }: PlatformShowcaseProps) {
  void _platforms;
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !gridRef.current) return;
    const ctx = gsap.context(() => {
      const tiles = gridRef.current?.querySelectorAll(".logo-tile");
      if (tiles) {
        gsap.fromTo(
          tiles,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.04,
            ease: "power2.out",
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
    <section ref={sectionRef} className="bg-white py-16 md:py-28 px-5 md:px-6 border-y border-[#e4e4e7]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 md:mb-12">
          <div className="inline-flex items-center gap-2 bg-[#dcfce7] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.06em] uppercase">
            We fund earners on
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#0a0a0a] mb-4"
            style={{ fontSize: "clamp(28px, 4.5vw, 52px)" }}
          >
            Every major platform.
          </h2>
          <p className="text-[#52525b] text-[15px] md:text-[16px] max-w-xl mx-auto">
            If your deposits come from any of these, your earnings qualify. No W-2 required.
          </p>
        </div>

        {/* Logo wall — uniform tile grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
        >
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="logo-tile group bg-white border border-[#e4e4e7] rounded-2xl h-24 md:h-28 flex items-center justify-center px-4 hover:border-[#15803d]/40 hover:shadow-[0_10px_24px_-12px_rgba(21,128,61,0.18)] transition-all duration-200 grayscale-[0.15] hover:grayscale-0"
              style={{ background: p.bg || "#ffffff" }}
              aria-label={p.name}
            >
              <span
                className="select-none"
                style={{
                  color: p.color,
                  fontWeight: p.weight ?? 700,
                  letterSpacing: p.letterSpacing ?? "-0.02em",
                  fontStyle: p.italic ? "italic" : undefined,
                  fontSize: "clamp(15px, 1.5vw, 20px)",
                  fontFamily: p.font || "-apple-system, 'Helvetica Neue', Inter, sans-serif",
                }}
              >
                {p.display}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <p className="text-center text-[#52525b] text-[14px] mt-12">
          Don&apos;t see your platform?{" "}
          <a
            href="/apply"
            className="text-[#15803d] font-semibold hover:underline underline-offset-4"
          >
            Apply anyway
          </a>
          . We review every deposit source.
        </p>

        {/* Trust line */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-[#71717a] font-semibold uppercase tracking-[0.08em]">
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7l3 3 7-7" />
            </svg>
            Bank-level encryption
          </span>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7l3 3 7-7" />
            </svg>
            Plaid-secured connection
          </span>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7l3 3 7-7" />
            </svg>
            Read-only access
          </span>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7l3 3 7-7" />
            </svg>
            No credit pull
          </span>
        </div>
      </div>
    </section>
  );
}

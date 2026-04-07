"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const FALLBACK_PLATFORMS = [
  "Uber", "Lyft", "DoorDash", "Instacart", "Amazon Flex",
  "Grubhub", "Fiverr", "Upwork", "TaskRabbit", "Shipt",
  "Postmates", "Caviar",
];

const ROTATIONS = [-3, 2, -1.5, 3, -2, 1, -3.5, 2.5, -1, 3, -2, 1.5];
const BG_COLORS = [
  "bg-white", "bg-[#dcfce7]", "bg-white", "bg-[#fef9c3]",
  "bg-white", "bg-[#dcfce7]", "bg-white", "bg-[#fef9c3]",
  "bg-white", "bg-[#dcfce7]", "bg-white", "bg-[#fef9c3]",
];

interface PlatformShowcaseProps {
  platforms: { name: string; slug: string }[];
}

export function PlatformShowcase({ platforms }: PlatformShowcaseProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const displayPlatforms =
    platforms.length > 0 ? platforms.map((p) => p.name) : FALLBACK_PLATFORMS;

  useEffect(() => {
    if (!sectionRef.current || !pinRef.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=40%",
        pin: pinRef.current,
        pinSpacing: true,
        anticipatePin: 1,
      });

      // Pills pop in one by one
      const pills = pillsRef.current?.querySelectorAll(".platform-pill");
      if (pills) {
        gsap.fromTo(
          pills,
          { opacity: 0, scale: 0.6, rotation: 0 },
          {
            opacity: 1,
            scale: 1,
            rotation: (i) => ROTATIONS[i % ROTATIONS.length],
            duration: 0.5,
            stagger: 0.06,
            ease: "back.out(1.8)",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 80%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }
    }, sectionRef);
    return () => ctx.revert();
  }, [displayPlatforms]);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "140vh" }}>
      <div
        ref={pinRef}
        className="h-screen bg-[#f0f5f0] flex items-center overflow-hidden"
      >
        <div className="max-w-5xl mx-auto w-full px-6">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 bg-white text-[#15803d] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase shadow-sm">
              Platform support
            </div>
            <h2
              className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a]"
              style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
            >
              Built for your platform.
            </h2>
            <p className="text-[#71717a] text-[16px] mt-4 max-w-lg mx-auto">
              We accept income verification from all major gig platforms. If you
              drive, deliver, or freelance, we&apos;ve got you.
            </p>
          </div>

          {/* Platform pills */}
          <div
            ref={pillsRef}
            className="flex flex-wrap gap-3 justify-center"
          >
            {displayPlatforms.map((name, i) => (
              <div
                key={i}
                className={`platform-pill ${BG_COLORS[i % BG_COLORS.length]} border border-[#e4e4e7] rounded-full px-5 py-2.5 shadow-sm opacity-0`}
                style={{ transform: `rotate(${ROTATIONS[i % ROTATIONS.length]}deg)` }}
              >
                <span className="font-extrabold text-[14px] text-[#1a1a1a] tracking-[-0.02em]">
                  {name}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom note */}
          <p className="text-center text-[#71717a] text-[13px] mt-10">
            Don&apos;t see your platform?{" "}
            <a href="/apply" className="text-[#15803d] underline font-medium">
              Apply anyway
            </a>{" "}
           , we review all gig income sources.
          </p>
        </div>
      </div>
    </section>
  );
}

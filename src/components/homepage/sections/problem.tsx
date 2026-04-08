"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const DOOR_FRAMES = [
  "/illustrations/door-1-closed.png",
  "/illustrations/door-2-crack.png",
  "/illustrations/door-3-half.png",
  "/illustrations/door-4-mostly.png",
  "/illustrations/door-5-open.png",
];

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const weDoRef = useRef<HTMLDivElement>(null);
  const frameRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

  useEffect(() => {
    if (!sectionRef.current || !pinRef.current) return;
    const ctx = gsap.context(() => {
      gsap.set(frameRefs[0].current, { opacity: 1 });
      gsap.set([frameRefs[1].current, frameRefs[2].current, frameRefs[3].current, frameRefs[4].current], { opacity: 0 });
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

      // Fade out "The Problem" text as door starts opening
      tl.to(problemRef.current, { opacity: 0, y: -20, duration: 0.5 }, 0.3);

      // Frame 1 -> 2
      tl.to(frameRefs[0].current, { opacity: 0, duration: 0.3 }, 0.5)
        .to(frameRefs[1].current, { opacity: 1, duration: 0.3 }, 0.5);

      // Frame 2 -> 3
      tl.to(frameRefs[1].current, { opacity: 0, duration: 0.3 }, 1.2)
        .to(frameRefs[2].current, { opacity: 1, duration: 0.3 }, 1.2);

      // Frame 3 -> 4
      tl.to(frameRefs[2].current, { opacity: 0, duration: 0.3 }, 1.9)
        .to(frameRefs[3].current, { opacity: 1, duration: 0.3 }, 1.9);

      // Frame 4 -> 5 (fully open)
      tl.to(frameRefs[3].current, { opacity: 0, duration: 0.3 }, 2.6)
        .to(frameRefs[4].current, { opacity: 1, duration: 0.3 }, 2.6);

      // After door is fully open, show "What We Do" text
      tl.to(weDoRef.current, { opacity: 1, y: 0, duration: 0.6 }, 3.2);

    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "400vh" }}>
      <div ref={pinRef} className="h-screen bg-[#faf8f0] flex items-center overflow-hidden">
        <div className="max-w-6xl mx-auto w-full px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

          {/* Left: Text */}
          <div className="relative min-h-[300px]">
            {/* "Banks don't get gig work" - visible at start, fades out */}
            <div ref={problemRef} className="absolute inset-0">
              <div className="inline-flex items-center gap-2 bg-[#fef2f2] text-[#dc2626] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                The Problem
              </div>
              <h2
                className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5"
                style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
              >
                Banks don&apos;t get
                <br />
                gig work.
              </h2>
              <div className="space-y-4">
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#dc2626] text-[18px] mt-0.5">&#10005;</span>
                  <span><strong className="text-black">73% of gig workers</strong> say traditional loans are completely inaccessible.</span>
                </p>
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#dc2626] text-[18px] mt-0.5">&#10005;</span>
                  <span><strong className="text-black">44% of SMBs</strong> don&apos;t even apply because they assume denial.</span>
                </p>
              </div>
            </div>

            {/* "What We Do" - appears only after door is fully open */}
            <div ref={weDoRef} className="absolute inset-0">
              <div className="inline-flex items-center gap-2 bg-[#f0fdf4] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                What We Do
              </div>
              <h2
                className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5"
                style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
              >
                We Do.
              </h2>
              <div className="space-y-4">
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">We verify your gig earnings</strong>, not your credit score.</span>
                </p>
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">$100 to $10,000</strong> for vehicle repairs, equipment, and operating costs.</span>
                </p>
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#15803d] text-[18px] mt-0.5">&#10003;</span>
                  <span><strong className="text-black">Funded in 48 hours.</strong> Apply in 5 minutes, decision same day.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Right: 5 door frames */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-[400px] aspect-square">
              {DOOR_FRAMES.map((src, i) => (
                <div key={i} ref={frameRefs[i]} className="absolute inset-0">
                  <Image
                    src={src}
                    alt={i === 0 ? "Closed bank door" : i === 4 ? "Open bank door" : "Bank door opening"}
                    fill
                    className="object-contain"
                    sizes="400px"
                    priority={i === 0}
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

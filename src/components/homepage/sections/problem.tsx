"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const weDoRef = useRef<HTMLDivElement>(null);
  const closedDoorRef = useRef<HTMLDivElement>(null);
  const openDoorRef = useRef<HTMLDivElement>(null);
  const doorWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !pinRef.current) return;
    const ctx = gsap.context(() => {
      gsap.set(closedDoorRef.current, { opacity: 1 });
      gsap.set(openDoorRef.current, { opacity: 0 });
      gsap.set(weDoRef.current, { opacity: 0, y: 30 });
      gsap.set(headlineRef.current, { opacity: 1 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=250%",
          pin: pinRef.current,
          pinSpacing: true,
          scrub: 1,
        },
      });

      // Frame 1-2: door starts opening
      tl.to(doorWrapRef.current, { rotateY: -20, duration: 1, ease: "none" }, 0);

      // Frame 2-3: door opening more
      tl.to(doorWrapRef.current, { rotateY: -45, duration: 1, ease: "none" }, 1);

      // Frame 3-4: swap to open door image
      tl.to(closedDoorRef.current, { opacity: 0, duration: 0.5 }, 2)
        .to(openDoorRef.current, { opacity: 1, duration: 0.5 }, 2)
        .to(doorWrapRef.current, { rotateY: -10, duration: 1, ease: "none" }, 2);

      // Frame 4-5: door settles, text changes to "What We Do"
      tl.to(doorWrapRef.current, { rotateY: 0, duration: 1, ease: "none" }, 3)
        .to(headlineRef.current, { opacity: 0, y: -30, duration: 0.5 }, 3)
        .to(weDoRef.current, { opacity: 1, y: 0, duration: 0.8 }, 3.3);

    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "350vh" }}>
      <div ref={pinRef} className="h-screen bg-[#faf8f0] flex items-center overflow-hidden">
        <div className="max-w-6xl mx-auto w-full px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

          <div className="relative">
            <div ref={headlineRef}>
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
                  <span><strong className="text-black">73% of gig workers</strong> say traditional loans are completely inaccessible to them.</span>
                </p>
                <p className="text-[#71717a] text-[16px] flex items-start gap-3">
                  <span className="text-[#dc2626] text-[18px] mt-0.5">&#10005;</span>
                  <span><strong className="text-black">44% of SMBs</strong> don&apos;t even apply because they assume denial.</span>
                </p>
              </div>
            </div>

            <div ref={weDoRef} className="absolute inset-0">
              <div className="inline-flex items-center gap-2 bg-[#f0fdf4] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                What We Do
              </div>
              <h2
                className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-5"
                style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
              >
                We open
                <br />
                <span className="text-[#15803d]">the door.</span>
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

          <div className="flex justify-center" style={{ perspective: "800px" }}>
            <div ref={doorWrapRef} className="relative w-full max-w-[380px] aspect-[3/4]" style={{ transformStyle: "preserve-3d", transformOrigin: "left center" }}>
              <div ref={closedDoorRef} className="absolute inset-0">
                <Image
                  src="/illustrations/problem-closed-door.png"
                  alt="Closed bank door"
                  fill
                  className="object-contain"
                  sizes="380px"
                />
              </div>
              <div ref={openDoorRef} className="absolute inset-0">
                <Image
                  src="/illustrations/open-door.png"
                  alt="Open door"
                  fill
                  className="object-contain"
                  sizes="380px"
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

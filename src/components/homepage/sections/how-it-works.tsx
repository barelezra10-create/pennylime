"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    num: "01",
    headline: "Apply in 5 minutes",
    desc: "Fill out our short form, no lengthy paperwork, no W-2 required. Just your platform earnings and basic info.",
    img: "/illustrations/step-1-apply.png",
    imgAlt: "Person applying on smartphone illustration",
  },
  {
    num: "02",
    headline: "We check earnings, not credit",
    desc: "We connect to your platform account to verify real income. Your credit score won't be pulled. We care about cash flow.",
    img: "/illustrations/step-2-approved.png",
    imgAlt: "Documents with green checkmark approval illustration",
  },
  {
    num: "03",
    headline: "Cash to your account",
    desc: "Approved? Funds hit your bank in as little as 24-48 hours. Back to earning, no interruptions.",
    img: "/illustrations/step-3-funded.png",
    imgAlt: "Money flowing into smartphone illustration",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinWrapRef = useRef<HTMLDivElement>(null);

  // Door phases
  const closedDoorRef = useRef<HTMLDivElement>(null);
  const openDoorRef = useRef<HTMLDivElement>(null);

  // Steps
  const stepsHeaderRef = useRef<HTMLDivElement>(null);
  const step0Ref = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const dot0Ref = useRef<HTMLDivElement>(null);
  const dot1Ref = useRef<HTMLDivElement>(null);
  const dot2Ref = useRef<HTMLDivElement>(null);
  const dotsWrapRef = useRef<HTMLDivElement>(null);

  const stepRefs = [step0Ref, step1Ref, step2Ref];
  const dotRefs = [dot0Ref, dot1Ref, dot2Ref];

  useEffect(() => {
    if (!sectionRef.current || !pinWrapRef.current) return;
    const ctx = gsap.context(() => {
      // Initial states
      gsap.set(closedDoorRef.current, { opacity: 1 });
      gsap.set(openDoorRef.current, { opacity: 0, y: 40 });
      gsap.set(stepsHeaderRef.current, { opacity: 0, y: 40 });
      gsap.set([step0Ref.current, step1Ref.current, step2Ref.current], { opacity: 0, y: 40 });
      gsap.set(dotsWrapRef.current, { opacity: 0 });
      gsap.set([dot0Ref.current], { backgroundColor: "#4ade80", scale: 1.2 });
      gsap.set([dot1Ref.current, dot2Ref.current], { backgroundColor: "#333", scale: 1 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=300%",
          pin: pinWrapRef.current,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 1,
        },
      });

      // Phase 1: Closed door (The Problem) - already visible at start
      // Phase 2: Closed door fades out, Open door fades in (What We Do)
      tl.to(closedDoorRef.current, { opacity: 0, y: -40, duration: 1 }, 1)
        .to(openDoorRef.current, { opacity: 1, y: 0, duration: 1 }, 1.2);

      // Phase 3: Open door fades out, Steps appear
      tl.to(openDoorRef.current, { opacity: 0, y: -40, duration: 1 }, 3)
        .to(stepsHeaderRef.current, { opacity: 1, y: 0, duration: 1 }, 3.2)
        .to(dotsWrapRef.current, { opacity: 1, duration: 0.5 }, 3.2)
        .to(step0Ref.current, { opacity: 1, y: 0, duration: 1 }, 3.3);

      // Phase 4: Step 0 → Step 1
      tl.to(step0Ref.current, { opacity: 0, y: -40, duration: 1 }, 5)
        .to(dot0Ref.current, { backgroundColor: "#333", scale: 1, duration: 1 }, 5)
        .to(step1Ref.current, { opacity: 1, y: 0, duration: 1 }, 5.1)
        .to(dot1Ref.current, { backgroundColor: "#4ade80", scale: 1.2, duration: 1 }, 5.1);

      // Phase 5: Step 1 → Step 2
      tl.to(step1Ref.current, { opacity: 0, y: -40, duration: 1 }, 7)
        .to(dot1Ref.current, { backgroundColor: "#333", scale: 1, duration: 1 }, 7)
        .to(step2Ref.current, { opacity: 1, y: 0, duration: 1 }, 7.1)
        .to(dot2Ref.current, { backgroundColor: "#4ade80", scale: 1.2, duration: 1 }, 7.1);
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "400vh" }}>
      <div
        ref={pinWrapRef}
        className="h-screen bg-[#1a1a1a] flex items-center overflow-hidden"
      >
        <div className="max-w-5xl mx-auto w-full px-6">

          {/* ─── Phase 1: Closed Door (The Problem) ─── */}
          <div ref={closedDoorRef} className="absolute inset-0 flex items-center">
            <div className="max-w-5xl mx-auto w-full px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-400 text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                  The Problem
                </div>
                <h2
                  className="font-extrabold tracking-[-0.04em] leading-[0.95] text-white mb-5"
                  style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
                >
                  Banks don&apos;t get
                  <br />
                  <span className="text-red-400">gig work.</span>
                </h2>
                <div className="space-y-4">
                  <p className="text-[#a1a1aa] text-[16px] flex items-start gap-3">
                    <span className="text-red-400 mt-1">x</span>
                    <span><strong className="text-white">73% of gig workers</strong> say traditional loans are inaccessible to them.</span>
                  </p>
                  <p className="text-[#a1a1aa] text-[16px] flex items-start gap-3">
                    <span className="text-red-400 mt-1">x</span>
                    <span><strong className="text-white">44% of SMBs</strong> don&apos;t even apply because they assume denial.</span>
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/illustrations/problem-closed-door.png"
                  alt="Closed bank door"
                  width={400}
                  height={400}
                  className="w-full max-w-[350px] object-contain"
                />
              </div>
            </div>
          </div>

          {/* ─── Phase 2: Open Door (What We Do) ─── */}
          <div ref={openDoorRef} className="absolute inset-0 flex items-center">
            <div className="max-w-5xl mx-auto w-full px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-[#15803d]/30 text-[#4ade80] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
                  What We Do
                </div>
                <h2
                  className="font-extrabold tracking-[-0.04em] leading-[0.95] text-white mb-5"
                  style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
                >
                  We open
                  <br />
                  <span className="text-[#4ade80]">the door.</span>
                </h2>
                <div className="space-y-4">
                  <p className="text-[#a1a1aa] text-[16px] flex items-start gap-3">
                    <span className="text-[#4ade80] mt-1">&#10003;</span>
                    <span><strong className="text-white">We verify your gig earnings</strong>, not your credit score.</span>
                  </p>
                  <p className="text-[#a1a1aa] text-[16px] flex items-start gap-3">
                    <span className="text-[#4ade80] mt-1">&#10003;</span>
                    <span><strong className="text-white">$100 to $10,000</strong> for vehicle repairs, equipment, and operating costs.</span>
                  </p>
                  <p className="text-[#a1a1aa] text-[16px] flex items-start gap-3">
                    <span className="text-[#4ade80] mt-1">&#10003;</span>
                    <span><strong className="text-white">Funded in 48 hours.</strong> Apply in 5 minutes, decision same day.</span>
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/illustrations/open-door.png"
                  alt="Open door representing opportunity"
                  width={400}
                  height={400}
                  className="w-full max-w-[350px] object-contain"
                />
              </div>
            </div>
          </div>

          {/* ─── Phase 3-5: Three Steps ─── */}
          <div ref={stepsHeaderRef} className="mb-16">
            <div className="inline-flex items-center gap-2 bg-[#15803d]/30 text-[#4ade80] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase">
              How it works
            </div>
            <h2
              className="font-extrabold tracking-[-0.04em] leading-[0.95] text-white"
              style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}
            >
              Three steps to funded.
            </h2>
          </div>

          <div className="relative h-64">
            {STEPS.map((step, i) => (
              <div
                key={i}
                ref={stepRefs[i]}
                className="absolute inset-0 flex items-start gap-8"
                style={{ opacity: 0 }}
              >
                <div className="shrink-0">
                  <span
                    className="font-extrabold tracking-[-0.06em] text-[#333] leading-none select-none"
                    style={{ fontSize: "clamp(80px, 10vw, 120px)" }}
                  >
                    {step.num}
                  </span>
                </div>
                <div className="pt-4">
                  <div className="mb-4">
                    <Image
                      src={step.img}
                      alt={step.imgAlt}
                      width={72}
                      height={72}
                      className="w-16 h-16 object-contain"
                    />
                  </div>
                  <h3
                    className="font-extrabold tracking-[-0.03em] text-white leading-tight mb-3"
                    style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
                  >
                    {step.headline}
                  </h3>
                  <p className="text-[#a1a1aa] text-[16px] leading-relaxed max-w-lg">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div ref={dotsWrapRef} className="flex gap-2 mt-12">
            {STEPS.map((_, i) => (
              <div
                key={i}
                ref={dotRefs[i]}
                className="w-2 h-2 rounded-full"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

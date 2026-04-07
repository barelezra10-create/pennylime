"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const STATS = [
  { value: 2000000, prefix: "$", suffix: "M+", display: "$2M+", label: "Total Funded" },
  { value: 1200, prefix: "", suffix: "+", display: "1,200+", label: "Workers Funded" },
  { value: 4.8, prefix: "", suffix: "★", display: "4.8★", label: "Average Rating" },
];

const TESTIMONIALS = [
  {
    quote: "I got denied at three banks because I drive for Uber. PennyLime approved me in 2 hours. Literally saved my car payment.",
    name: "Marcus T.",
    role: "Uber & DoorDash Driver",
    location: "Atlanta, GA",
  },
  {
    quote: "As a freelancer, income verification is always a headache. PennyLime just connected to my Upwork earnings and that was it.",
    name: "Priya S.",
    role: "Upwork Freelancer",
    location: "Austin, TX",
  },
  {
    quote: "Applied Sunday night, had the money Monday. The rate was fair and the process was actually simple.",
    name: "Jordan K.",
    role: "Amazon Flex Driver",
    location: "Chicago, IL",
  },
];

export function SocialProof() {
  const sectionRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      // Animate stat counters
      const statEls = statsRef.current?.querySelectorAll(".stat-value");
      statEls?.forEach((el, i) => {
        const stat = STATS[i];
        ScrollTrigger.create({
          trigger: el,
          start: "top 85%",
          once: true,
          onEnter: () => {
            const obj = { val: 0 };
            gsap.to(obj, {
              val: stat.value,
              duration: 2,
              ease: "power2.out",
              onUpdate: () => {
                const formatted =
                  stat.value >= 1000000
                    ? `$${(obj.val / 1000000).toFixed(1)}M+`
                    : stat.value === 4.8
                    ? `${obj.val.toFixed(1)}★`
                    : `${Math.round(obj.val).toLocaleString()}+`;
                (el as HTMLElement).textContent = formatted;
              },
            });
          },
        });
      });

      // Testimonials stagger in
      const cards = sectionRef.current!.querySelectorAll(".testimonial-card");
      gsap.fromTo(
        Array.from(cards),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 60%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-white py-24 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">
        {/* Stats */}
        <div
          ref={statsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20"
        >
          {STATS.map((stat, i) => (
            <div key={i} className="text-center">
              <div
                className="stat-value font-extrabold tracking-[-0.05em] text-[#1a1a1a] leading-none"
                style={{ fontSize: "clamp(48px, 6vw, 80px)" }}
              >
                {stat.display}
              </div>
              <div className="text-[#71717a] text-[14px] mt-2 uppercase tracking-[0.06em] font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Divider squiggle */}
        <div className="flex justify-center mb-16">
          <svg width="200" height="16" viewBox="0 0 200 16" fill="none" aria-hidden="true">
            <path
              d="M4 8 C 24 2, 44 14, 64 8 S 104 2, 124 8 S 164 14, 196 6"
              stroke="#15803d"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="testimonial-card bg-[#faf8f0] rounded-2xl p-6 border border-[#e4e4e7]"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, s) => (
                  <span key={s} className="text-[#15803d] text-[14px]">★</span>
                ))}
              </div>
              <blockquote className="text-[#1a1a1a] text-[15px] leading-relaxed mb-6 italic">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div>
                <div className="font-bold text-[#1a1a1a] text-[14px]">{t.name}</div>
                <div className="text-[#71717a] text-[12px]">{t.role}</div>
                <div className="text-[#71717a] text-[12px]">{t.location}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

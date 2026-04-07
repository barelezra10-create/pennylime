"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const INDUSTRIES = [
  {
    name: "Rideshare",
    platforms: "Uber, Lyft",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 22V16L7 10H25L28 16V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="22" r="3" stroke="currentColor" strokeWidth="2" /><circle cx="23" cy="22" r="3" stroke="currentColor" strokeWidth="2" /><path d="M12 22H20" stroke="currentColor" strokeWidth="2" /></svg>
    ),
    description: "Drive passengers, earn on your schedule. Average Uber driver makes $20-30/hour before expenses. Whether full-time or side hustle, we fund rideshare drivers in 48 hours.",
    stats: { avgEarnings: "$45K/yr", drivers: "1.5M+" },
    color: "bg-[#eff6ff]",
    href: "/loans/uber",
  },
  {
    name: "Food Delivery",
    platforms: "DoorDash, Grubhub, Uber Eats",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 24V12L16 6L26 12V24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><rect x="12" y="18" width="8" height="6" stroke="currentColor" strokeWidth="2" rx="1" /><path d="M16 6V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    ),
    description: "Deliver meals across your city. Peak hours, bad weather bonuses, and tips add up fast. When your bike needs replacing or your car needs repairs, we fund your business costs instantly.",
    stats: { avgEarnings: "$38K/yr", drivers: "2M+" },
    color: "bg-[#fef9ec]",
    href: "/loans/doordash",
  },
  {
    name: "Grocery & Shopping",
    platforms: "Instacart, Shipt",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M8 8H28L26 22H10L8 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M4 4H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="13" cy="26" r="2" stroke="currentColor" strokeWidth="2" /><circle cx="23" cy="26" r="2" stroke="currentColor" strokeWidth="2" /></svg>
    ),
    description: "Shop and deliver groceries on demand. Consistent income with tip potential. Instacart shoppers handle 3-5 batches daily. We fund personal shoppers same-day.",
    stats: { avgEarnings: "$32K/yr", drivers: "600K+" },
    color: "bg-[#f0fdf4]",
    href: "/loans/instacart",
  },
  {
    name: "Freelance & Creative",
    platforms: "Fiverr, Upwork",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="6" y="8" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M12 26H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 22V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    ),
    description: "Designers, developers, writers, marketers. Invoices take 30+ days to clear but bills don't wait. We fund freelancers based on platform earnings, not credit.",
    stats: { avgEarnings: "$52K/yr", drivers: "3M+" },
    color: "bg-[#faf5ff]",
    href: "/loans/fiverr",
  },
  {
    name: "Home Services",
    platforms: "TaskRabbit, Thumbtack",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M20 8L24 12L14 22L10 18L20 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 18L6 22L10 26L14 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    ),
    description: "Handymen, movers, cleaners, assemblers. Physical work with variable demand. Equipment costs, van maintenance, and slow months happen. We fund in hours.",
    stats: { avgEarnings: "$42K/yr", drivers: "800K+" },
    color: "bg-[#fff7ed]",
    href: "/loans/taskrabbit",
  },
  {
    name: "Auto & Transport",
    platforms: "Amazon Flex, Turo",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="24" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 10V8C8 6.9 8.9 6 10 6H22C23.1 6 24 6.9 24 8V10" stroke="currentColor" strokeWidth="2" /><path d="M12 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 14V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    ),
    description: "Deliver packages or list your car. Amazon Flex drivers run 3-5 hour blocks. Turo hosts earn passive income. When vehicle maintenance costs spike, we fund it fast.",
    stats: { avgEarnings: "$35K/yr", drivers: "500K+" },
    color: "bg-[#fef2f2]",
    href: "/loans/amazon-flex",
  },
];

export function Industries() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !cardsRef.current) return;
    const ctx = gsap.context(() => {
      const cards = cardsRef.current?.querySelectorAll(".industry-card");
      if (cards) {
        gsap.fromTo(cards,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out",
            scrollTrigger: { trigger: sectionRef.current, start: "top 75%", toggleActions: "play none none reverse" } }
        );
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-white py-20 md:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="max-w-2xl mb-14">
          <div className="inline-flex items-center gap-2 bg-[#f0f5f0] text-[#15803d] text-[11px] font-bold px-3 py-1.5 rounded-full mb-5 tracking-[0.04em] uppercase">
            Industries we serve
          </div>
          <h2
            className="font-extrabold tracking-[-0.04em] leading-[0.95] text-black mb-4"
            style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
          >
            Built for every
            <br />
            <span className="text-[#15803d]">gig worker.</span>
          </h2>
          <p className="text-[#71717a] text-[17px] leading-relaxed">
            From rideshare to freelance, grocery delivery to home services.
            If you earn on a platform, we fund you.
          </p>
        </div>

        {/* Industry cards */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {INDUSTRIES.map((industry) => (
            <Link
              key={industry.name}
              href={industry.href}
              className="industry-card group block rounded-2xl border border-[#e4e4e7] p-6 hover:shadow-lg hover:border-[#15803d]/30 transition-all duration-300"
            >
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 rounded-xl ${industry.color} flex items-center justify-center text-[#15803d]`}>
                  {industry.icon}
                </div>
                <span className="text-[11px] font-bold text-[#a1a1aa] uppercase tracking-[0.04em]">
                  {industry.platforms}
                </span>
              </div>

              {/* Name */}
              <h3 className="text-[20px] font-extrabold tracking-[-0.02em] text-black mb-2 group-hover:text-[#15803d] transition-colors">
                {industry.name}
              </h3>

              {/* Description */}
              <p className="text-[14px] text-[#71717a] leading-relaxed mb-5">
                {industry.description}
              </p>

              {/* Stats */}
              <div className="flex gap-6 pt-4 border-t border-[#f4f4f5]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Avg Earnings</p>
                  <p className="text-[16px] font-extrabold text-black">{industry.stats.avgEarnings}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Workers</p>
                  <p className="text-[16px] font-extrabold text-black">{industry.stats.drivers}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-[15px] text-[#71717a] mb-4">
            Don&apos;t see your platform? <span className="font-bold text-black">We review all gig income sources.</span>
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#166534] transition-colors shadow-lg shadow-green-900/20"
          >
            Apply Now
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export function ContentCta({ text, subtext, variant = "default" }: { text?: string; subtext?: string; variant?: "default" | "inline" | "banner" }) {
  const [dismissed, setDismissed] = useState(false);

  if (variant === "inline") {
    if (dismissed) return null;
    return (
      <div className="my-8 bg-gradient-to-r from-[#15803d] to-[#166534] rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center gap-4 text-white relative">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-white/80 hover:bg-white/30 hover:text-white transition-colors text-[14px]"
          aria-label="Dismiss"
        >
          x
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <LogoMark size={20} />
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#bbf7d0]">PennyLime</span>
          </div>
          <p className="text-[16px] font-extrabold tracking-[-0.02em]">
            {text || "Need cash between gigs?"}
          </p>
          <p className="text-[13px] text-[#bbf7d0] mt-0.5">
            {subtext || "$100 - $10,000. No credit check. Funded in 48 hours."}
          </p>
        </div>
        <Link
          href="/apply"
          className="shrink-0 bg-white text-[#15803d] font-bold text-[13px] px-5 py-3 rounded-xl hover:bg-[#f0fdf4] transition-colors shadow-lg"
        >
          Apply Now
        </Link>
      </div>
    );
  }

  if (variant === "banner") {
    if (dismissed) return null;
    return (
      <div className="my-8 border border-[#15803d]/30 rounded-xl p-4 bg-[#f0fdf4] relative">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-[#15803d]/50 hover:bg-[#15803d]/10 hover:text-[#15803d] transition-colors text-[14px]"
          aria-label="Dismiss"
        >
          x
        </button>
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <LogoMark size={20} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-black leading-tight">
              {text || "Did you know?"}
            </p>
            <p className="text-[13px] text-[#52525b] leading-relaxed mt-1">
              {subtext || "PennyLime doesn't check your credit score. We verify your gig platform earnings directly, so a low credit score won't hold you back."}
            </p>
            <Link href="/apply" className="text-[13px] font-bold text-[#15803d] hover:underline mt-1.5 inline-block">
              Check your eligibility &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // default, end-of-article CTA
  return (
    <section className="mt-14 bg-gradient-to-br from-[#15803d] to-[#14532d] rounded-2xl p-8 md:p-12 text-center text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[300px] h-[300px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[200px] h-[200px] rounded-full bg-[#4ade80]/10 blur-3xl" />
      </div>
      <div className="relative z-10">
        <LogoMark size={36} className="mx-auto mb-4" />
        <h2 className="text-[28px] font-extrabold tracking-[-0.03em] mb-3">
          {text || "Ready to Get Funded?"}
        </h2>
        <p className="text-[16px] text-[#bbf7d0] mb-6 max-w-md mx-auto">
          {subtext || "Join 1,200+ gig workers who funded their business expenses. No credit check. Apply in 5 minutes."}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/apply"
            className="bg-white text-[#15803d] font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#f0fdf4] transition-colors shadow-xl"
          >
            Start My Application
          </Link>
          <Link
            href="/tools/loan-calculator"
            className="text-[#bbf7d0] font-medium text-[14px] hover:text-white transition-colors"
          >
            Calculate my payment &rarr;
          </Link>
        </div>
        <div className="flex justify-center gap-6 mt-6 text-[12px] text-[#86efac]">
          <span>No credit check</span>
          <span>48h funding</span>
          <span>$100 - $10K</span>
        </div>
      </div>
    </section>
  );
}

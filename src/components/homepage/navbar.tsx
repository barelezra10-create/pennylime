"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Logo, LogoMark } from "@/components/brand/logo";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const logoRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let angle = 0;
    let lastScrollY = window.scrollY;

    function onFrame() {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      // Spin based on scroll speed + always slowly spinning
      angle += delta * 1.5 + 0.3;

      if (logoRef.current) {
        logoRef.current.style.transform = `rotate(${angle}deg)`;
      }
      rafId = requestAnimationFrame(onFrame);
    }

    let rafId = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#e4e4e7]">
      <div className="max-w-6xl mx-auto px-4 md:px-4 flex items-center justify-between h-16 md:h-20">
        <Link href="/" aria-label="PennyLime home" className="inline-flex items-center gap-2">
          <span ref={logoRef} className="inline-flex items-center justify-center" style={{ transformOrigin: "center center" }}>
            <LogoMark size={40} />
          </span>
          <span className="font-extrabold text-[19px] md:text-[22px] tracking-[-0.03em]">
            Penny<span className="text-[#15803d]">Lime<span className="text-[#15803d]">.</span></span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link href="/blog" className="text-[13px] text-[#52525b] hover:text-[#1a1a1a]">Blog</Link>
          <Link href="/tools" className="text-[13px] text-[#52525b] hover:text-[#1a1a1a]">Tools</Link>
          <Link href="/portal/login" className="text-[13px] text-[#52525b] hover:text-[#1a1a1a]">Sign in</Link>
          <Link href="/apply" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">Apply Now</Link>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-[#1a1a1a] inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-lg hover:bg-[#fafaf7] transition-colors"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? (
            <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-[#e4e4e7] bg-white px-4 py-4 space-y-1 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.08)]">
          <Link
            href="/blog"
            onClick={() => setOpen(false)}
            className="flex items-center text-[15px] font-medium text-[#1a1a1a] min-h-[48px] px-3 rounded-lg hover:bg-[#fafaf7]"
          >
            Blog
          </Link>
          <Link
            href="/tools"
            onClick={() => setOpen(false)}
            className="flex items-center text-[15px] font-medium text-[#1a1a1a] min-h-[48px] px-3 rounded-lg hover:bg-[#fafaf7]"
          >
            Tools
          </Link>
          <Link
            href="/portal/login"
            onClick={() => setOpen(false)}
            className="flex items-center text-[15px] font-medium text-[#1a1a1a] min-h-[48px] px-3 rounded-lg hover:bg-[#fafaf7]"
          >
            Sign in
          </Link>
          <Link
            href="/apply"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center bg-[#15803d] text-white text-[15px] font-semibold px-4 min-h-[52px] rounded-xl text-center mt-2 shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          >
            Apply Now
          </Link>
        </div>
      )}
    </nav>
  );
}

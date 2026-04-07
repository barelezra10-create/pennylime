"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#e4e4e7]">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-20">
        <Link href="/" aria-label="PennyLime home">
          <Logo size={48} textClassName="font-extrabold text-[22px] tracking-[-0.03em]" />
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link href="/blog" className="text-[13px] text-[#71717a] hover:text-[#1a1a1a]">Blog</Link>
          <Link href="/tools/loan-calculator" className="text-[13px] text-[#71717a] hover:text-[#1a1a1a]">Tools</Link>
          <Link href="/apply" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">Apply Now</Link>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-[#1a1a1a]">
          <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-[#e4e4e7] px-4 py-3 space-y-2 bg-white">
          <Link href="/blog" className="block text-[13px] text-[#71717a] py-1">Blog</Link>
          <Link href="/tools/loan-calculator" className="block text-[13px] text-[#71717a] py-1">Tools</Link>
          <Link href="/apply" className="block bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg text-center mt-2">Apply Now</Link>
        </div>
      )}
    </nav>
  );
}

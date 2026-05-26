import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-5 md:px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 md:gap-8">
          <div>
            <span className="inline-flex items-center gap-2 font-extrabold text-[20px] tracking-[-0.03em]">
              <LogoMark size={40} />
              Penny<span className="text-[#4ade80]">Lime<span className="text-[#4ade80]">.</span></span>
            </span>
            <p className="text-[13px] text-[#a1a1aa] mt-3 max-w-[260px]">Funding for drivers, sellers, and operators. Built for the way platforms pay.</p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Company</h4>
            <div className="space-y-2">
              <Link href="/blog" className="block text-[13px] text-[#d4d4d8] hover:text-white">Blog</Link>
              <Link href="/apply" className="block text-[13px] text-[#d4d4d8] hover:text-white">Apply</Link>
              <Link href="/portal/login" className="block text-[13px] text-[#d4d4d8] hover:text-white">My Account</Link>
              <Link href="/status" className="block text-[13px] text-[#d4d4d8] hover:text-white">Check Status</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Resources</h4>
            <div className="space-y-2">
              <Link href="/tools" className="block text-[13px] text-[#d4d4d8] hover:text-white">Advance Calculator</Link>
              <Link href="/blog/category/guides" className="block text-[13px] text-[#d4d4d8] hover:text-white">Guides</Link>
              <Link href="/cash-advance" className="block text-[13px] text-[#d4d4d8] hover:text-white">By Platform</Link>
              <Link href="/states" className="block text-[13px] text-[#d4d4d8] hover:text-white">By State</Link>
              <Link href="/compare" className="block text-[13px] text-[#d4d4d8] hover:text-white">Comparisons</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Legal</h4>
            <div className="space-y-2">
              <Link href="/privacy" className="block text-[13px] text-[#d4d4d8] hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="block text-[13px] text-[#d4d4d8] hover:text-white">Terms of Service</Link>
              <Link href="/disclosures" className="block text-[13px] text-[#d4d4d8] hover:text-white">Disclosures</Link>
              <Link href="/security" className="block text-[13px] text-[#d4d4d8] hover:text-white">Information Security</Link>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-[#333] text-[12px] text-[#71717a]">
          &copy; {new Date().getFullYear()} PennyLime. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

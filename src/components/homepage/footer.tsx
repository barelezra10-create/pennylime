import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white py-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <span className="inline-flex items-center gap-2 font-extrabold text-[20px] tracking-[-0.03em]">
              <LogoMark size={40} />
              Penny<span className="text-[#4ade80]">Lime</span>
            </span>
            <p className="text-[13px] text-[#a1a1aa] mt-2">Fast loans for gig workers. $100 to $10,000.</p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Company</h4>
            <div className="space-y-2">
              <Link href="/blog" className="block text-[13px] text-[#d4d4d8] hover:text-white">Blog</Link>
              <Link href="/apply" className="block text-[13px] text-[#d4d4d8] hover:text-white">Apply</Link>
              <Link href="/status" className="block text-[13px] text-[#d4d4d8] hover:text-white">Check Status</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Resources</h4>
            <div className="space-y-2">
              <Link href="/tools/loan-calculator" className="block text-[13px] text-[#d4d4d8] hover:text-white">Loan Calculator</Link>
              <Link href="/blog/category/guides" className="block text-[13px] text-[#d4d4d8] hover:text-white">Guides</Link>
              <Link href="/compare/pennylime-vs-fundo" className="block text-[13px] text-[#d4d4d8] hover:text-white">Comparisons</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Legal</h4>
            <div className="space-y-2">
              <Link href="/privacy" className="block text-[13px] text-[#d4d4d8] hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="block text-[13px] text-[#d4d4d8] hover:text-white">Terms of Service</Link>
              <Link href="/disclosures" className="block text-[13px] text-[#d4d4d8] hover:text-white">Disclosures</Link>
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

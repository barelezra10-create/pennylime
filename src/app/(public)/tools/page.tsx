export const dynamic = "force-dynamic";

import { getPublishedToolPages } from "@/actions/content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = generateMeta({
  title: "Free Gig Worker Tools",
  description: "Free calculators and tools for Uber, Lyft, DoorDash drivers and gig workers. Loan calculator, earnings estimator, expense tracker, and more.",
}) as Metadata;

const TOOL_ICONS: Record<string, React.ReactNode> = {
  "loan-calculator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="5" y="3" width="18" height="22" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 8H19M9 12H14M9 16H19M9 20H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  "income-estimator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 20L10 14L14 18L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 8H24V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  "loan-comparison": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="10" width="8" height="14" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="17" y="4" width="8" height="20" rx="1" stroke="currentColor" strokeWidth="2" /><path d="M13 14H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  "dti-calculator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2" /><path d="M14 8V14L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  "tax-estimator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="4" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M4 10H24M10 10V24" stroke="currentColor" strokeWidth="2" /></svg>,
  "uber-earnings-calculator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 22V16L7 10H21L24 16V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="22" r="2.5" stroke="currentColor" strokeWidth="2" /><circle cx="19" cy="22" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>,
  "gig-expense-tracker": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 4V24M4 14H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2" /></svg>,
  "platform-comparison-calculator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="6" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="16" y="6" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="2" /><path d="M12 14H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  "loan-affordability-calculator": <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 4L4 9V18C4 22 8 26 14 28C20 26 24 22 24 18V9L14 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M10 14L13 17L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

export default async function ToolsPage() {
  const tools = await getPublishedToolPages();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools", href: "/tools" }]} />

      <div className="mb-10">
        <h1 className="text-[36px] font-extrabold tracking-[-0.03em] text-black mb-3">
          Free Tools for Gig Workers
        </h1>
        <p className="text-[16px] text-[#71717a] max-w-2xl">
          Calculators and tools built for Uber, Lyft, DoorDash drivers and independent contractors.
          Know your earnings, expenses, and loan options before you apply.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tools.map((tool) => (
          <Link
            key={tool.id}
            href={`/tools/${tool.slug}`}
            className="group block bg-white rounded-2xl border border-[#e4e4e7] p-6 hover:shadow-lg hover:border-[#15803d]/30 transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-xl bg-[#f0f5f0] flex items-center justify-center text-[#15803d] mb-4 group-hover:scale-105 transition-transform">
              {TOOL_ICONS[tool.toolComponent] || (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="4" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M10 14H18M14 10V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              )}
            </div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-black mb-2 group-hover:text-[#15803d] transition-colors">
              {tool.title}
            </h2>
            <p className="text-[14px] text-[#71717a] leading-relaxed">
              {tool.description}
            </p>
            <span className="inline-block mt-4 text-[13px] font-bold text-[#15803d]">
              Use tool &rarr;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

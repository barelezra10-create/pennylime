export const dynamic = "force-static";
export const revalidate = 3600;

import { getPublishedPlatformPages } from "@/actions/content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = generateMeta({
  title: "Cash Advances for Gig Workers — PennyLime",
  description:
    "Fast cash advances for Uber, Lyft, DoorDash, Amazon Flex, Instacart, and every other gig platform. No credit check. Funded in as fast as 24 hours.",
}) as Metadata;

export default async function CashAdvanceHubPage() {
  const platforms = await getPublishedPlatformPages();
  // Sort: alphabetical so it's easy to scan.
  platforms.sort((a, b) => a.platformName.localeCompare(b.platformName));

  return (
    <div className="min-h-screen bg-[#fafaf7]">
      <header className="bg-gradient-to-b from-[#f0fdf4] to-[#fafaf7] border-b border-[#e4e4e7]">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Cash Advance", href: "/cash-advance" },
            ]}
          />
          <h1 className="mt-6 text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em] text-[#0a0a0a] leading-[1.05] max-w-3xl">
            Cash advances built for every gig platform
          </h1>
          <p className="mt-4 text-[17px] md:text-[18px] text-[#52525b] max-w-2xl leading-relaxed">
            Pick your platform below to see how PennyLime cash advances work for {platforms.length}+ gig services. No credit check required, decisions in minutes, funded in as fast as 24 hours.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 bg-[#15803d] text-white text-[15px] font-bold px-6 py-3.5 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_8px_20px_-8px_rgba(21,128,61,0.5)]"
            >
              Apply now
              <span aria-hidden>→</span>
            </Link>
            <span className="text-[13px] text-[#71717a]">$500 to $10,000 · 5-minute application</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-16">
        <h2 className="text-[22px] md:text-[26px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-6">
          All supported platforms
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {platforms.map((p) => (
            <Link
              key={p.slug}
              href={`/cash-advance/${p.slug}`}
              className="group bg-white rounded-2xl border border-[#e4e4e7] p-5 hover:border-[#15803d] hover:shadow-[0_4px_16px_-8px_rgba(21,128,61,0.3)] transition-all"
            >
              <p className="text-[15px] font-bold text-[#0a0a0a] group-hover:text-[#15803d] transition-colors">
                {p.platformName}
              </p>
              <p className="mt-1 text-[12px] text-[#71717a]">
                Cash advance →
              </p>
            </Link>
          ))}
        </div>

        <section className="mt-14 bg-white rounded-2xl border border-[#e4e4e7] p-6 md:p-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-3">
            Don&rsquo;t see your platform?
          </h2>
          <p className="text-[14px] text-[#52525b] leading-relaxed mb-4">
            We fund workers on any platform that pays direct-deposit to a US bank account. Self-employed, side-hustle, multi-platform — whatever your income looks like, our underwriting reads your bank deposits, not your job title.
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white text-[14px] font-bold px-5 py-2.5 rounded-lg hover:bg-[#166534] transition-colors"
          >
            Apply anyway
            <span aria-hidden>→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

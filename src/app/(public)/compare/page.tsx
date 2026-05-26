export const revalidate = 3600;

import Link from "next/link";
import { getPublishedComparisonPages } from "@/actions/content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import { ContentCta } from "@/components/content/content-cta";
import type { Metadata } from "next";

export const metadata: Metadata = generateMeta({
  title: "Compare PennyLime to Other Funding Options",
  description:
    "Side-by-side comparisons of PennyLime cash advances against credit cards, payday loans, traditional bank loans, Fundo, and other gig-worker funding products. Pick the right tool for your situation.",
  path: "/compare",
}) as Metadata;

export default async function CompareIndexPage() {
  const comparisons = await getPublishedComparisonPages();
  const sorted = [...comparisons].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <main className="max-w-[1100px] mx-auto px-5 md:px-6 py-12 md:py-16">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare", href: "/compare" }]} />

      <header className="mb-10">
        <h1 className="text-[32px] md:text-[40px] font-extrabold tracking-[-0.035em] text-[#0a0a0a] mb-4">
          How does PennyLime compare?
        </h1>
        <p className="text-[16px] md:text-[17px] text-[#52525b] max-w-[680px] leading-relaxed">
          Cash advances aren&apos;t the only way to bridge a cash crunch. Here&apos;s how PennyLime stacks
          up against the other funding options gig workers and 1099 contractors actually use.
        </p>
      </header>

      {sorted.length === 0 ? (
        <p className="text-[#71717a]">Comparisons coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="group block bg-white border border-[#e4e4e7] rounded-2xl p-6 hover:border-[#15803d] hover:shadow-sm transition-all"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa] mb-2">
                {c.entityA} vs {c.entityB}
              </p>
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] group-hover:text-[#15803d] mb-2">
                {c.title}
              </h2>
              {c.metaDescription && (
                <p className="text-[13px] text-[#52525b] line-clamp-3 leading-relaxed">
                  {c.metaDescription}
                </p>
              )}
              <span className="inline-block mt-3 text-[12px] font-semibold text-[#15803d] group-hover:underline">
                Read comparison →
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-16">
        <ContentCta />
      </div>
    </main>
  );
}

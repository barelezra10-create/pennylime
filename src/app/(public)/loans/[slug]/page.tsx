export const dynamic = "force-dynamic";

import { getPlatformPageBySlug, getPublishedPlatformPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, loanProductSchema, faqSchema } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";
import type { FaqEntry } from "@/types/content";

export async function generateStaticParams() {
  const platforms = await getPublishedPlatformPages();
  return platforms.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getPlatformPageBySlug(slug);
  if (!platform) return {};
  return generateMeta({
    title: platform.metaTitle || `Loans for ${platform.platformName} Workers`,
    description: platform.metaDescription || platform.heroSubtext,
  }) as Metadata;
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = await getPlatformPageBySlug(slug);
  if (!platform || !platform.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(platform.faqEntries);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={loanProductSchema()} />
      <JsonLd data={faqSchema(faqs)} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: platform.platformName, href: `/loans/${platform.slug}` }]} />

      <header className="mb-8">
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] leading-tight">{platform.heroHeadline}</h1>
        <p className="text-[16px] text-[#71717a] mt-2">{platform.heroSubtext}</p>
        <Link href="/apply" className="inline-block mt-4 bg-[#15803d] text-white text-[14px] font-medium px-6 py-3 rounded-lg hover:bg-[#166534]">
          {platform.ctaText || "Apply Now"}
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">About {platform.platformName} Loans</h2>
        <p className="text-[14px] text-[#71717a] leading-relaxed">{platform.platformDescription}</p>
      </section>

      {(platform.avgEarnings || platform.topEarnerRange) && (
        <section className="grid grid-cols-2 gap-4 mb-8">
          {platform.avgEarnings && (
            <div className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Avg Earnings</p>
              <p className="text-[22px] font-extrabold text-[#1a1a1a]">{platform.avgEarnings}</p>
            </div>
          )}
          {platform.topEarnerRange && (
            <div className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Top Earners</p>
              <p className="text-[22px] font-extrabold text-[#1a1a1a]">{platform.topEarnerRange}</p>
            </div>
          )}
        </section>
      )}

      {platform.loanDetailsHtml && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">Loan Details</h2>
          <div className="text-[14px] text-[#71717a] leading-relaxed" dangerouslySetInnerHTML={{ __html: platform.loanDetailsHtml }} />
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta text={platform.ctaText || undefined} subtext={platform.ctaSubtext || undefined} />
    </div>
  );
}
export const dynamic = "force-dynamic";

import { getComparisonPageBySlug, getPublishedComparisonPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import type { Metadata } from "next";
import type { FaqEntry, ComparisonRow } from "@/types/content";

export async function generateStaticParams() {
  const comparisons = await getPublishedComparisonPages();
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const comp = await getComparisonPageBySlug(slug);
  if (!comp) return {};
  return generateMeta({ title: comp.metaTitle || comp.title, description: comp.metaDescription || `Compare ${comp.entityA} vs ${comp.entityB}` }) as Metadata;
}

export default async function ComparisonPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getComparisonPageBySlug(slug);
  if (!comp || !comp.published) notFound();

  const grid: ComparisonRow[] = JSON.parse(comp.comparisonGrid);
  const faqs: FaqEntry[] = JSON.parse(comp.faqEntries);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare", href: `/compare/${comp.slug}` }, { label: comp.title, href: `/compare/${comp.slug}` }]} />
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-4">{comp.title}</h1>
      {comp.introHtml && <div className="text-[14px] text-[#71717a] leading-relaxed mb-8" dangerouslySetInnerHTML={{ __html: comp.introHtml }} />}

      {grid.length > 0 && (
        <div className="overflow-x-auto mb-8">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f0f5f0]">
                <th className="text-left text-[13px] font-bold text-[#1a1a1a] px-4 py-3">Feature</th>
                <th className="text-left text-[13px] font-bold text-[#15803d] px-4 py-3">{comp.entityA}</th>
                <th className="text-left text-[13px] font-bold text-[#71717a] px-4 py-3">{comp.entityB}</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((row, i) => (
                <tr key={i} className="border-b border-[#e4e4e7]">
                  <td className="text-[13px] font-medium text-[#1a1a1a] px-4 py-3">{row.feature}</td>
                  <td className="text-[13px] text-[#71717a] px-4 py-3">{row.entityAValue}</td>
                  <td className="text-[13px] text-[#71717a] px-4 py-3">{row.entityBValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comp.verdict && (
        <section className="bg-[#f0f5f0] rounded-[10px] p-6 mb-8">
          <h2 className="text-[18px] font-extrabold text-[#1a1a1a] mb-2">Our Verdict</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{comp.verdict}</p>
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta />
    </div>
  );
}
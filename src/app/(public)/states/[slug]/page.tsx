export const dynamic = "force-dynamic";

import { getStatePageBySlug, getPublishedStatePages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, loanProductSchema } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";
import type { FaqEntry, LocalStat } from "@/types/content";

export async function generateStaticParams() {
  const states = await getPublishedStatePages();
  return states.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const state = await getStatePageBySlug(slug);
  if (!state) return {};
  return generateMeta({
    title: state.metaTitle || `1099 Loans in ${state.stateName}`,
    description: state.metaDescription || state.heroSubtext,
  }) as Metadata;
}

export default async function StatePageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const state = await getStatePageBySlug(slug);
  if (!state || !state.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(state.faqEntries);
  const stats: LocalStat[] = JSON.parse(state.localStats);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={loanProductSchema()} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: `${state.stateName}`, href: `/states/${state.slug}` }]} />

      <header className="mb-8">
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-black leading-tight">{state.heroHeadline}</h1>
        <p className="text-[16px] text-[#71717a] mt-2">{state.heroSubtext}</p>
        <Link href="/apply" className="inline-block mt-4 bg-[#15803d] text-white text-[14px] font-medium px-6 py-3 rounded-lg hover:bg-[#166534]">
          {state.ctaText || "Apply Now"}
        </Link>
      </header>

      {stats.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">{stat.label}</p>
              <p className="text-[18px] font-extrabold text-black">{stat.value}</p>
            </div>
          ))}
        </section>
      )}

      {state.regulationsSummary && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-black mb-3">Lending Regulations in {state.stateName}</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{state.regulationsSummary}</p>
        </section>
      )}

      {state.loanAvailability && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-black mb-3">Loan Availability</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{state.loanAvailability}</p>
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta />
    </div>
  );
}

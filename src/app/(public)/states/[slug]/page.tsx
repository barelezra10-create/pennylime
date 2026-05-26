export const dynamic = "force-dynamic";

import { getStatePageBySlug, getPublishedStatePages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, cashAdvanceProductSchema } from "@/components/seo/json-ld";
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
    title: state.metaTitle || `1099 Cash Advances in ${state.stateName}`,
    description: state.metaDescription || state.heroSubtext,
    path: `/states/${slug}`,
  }) as Metadata;
}

export default async function StatePageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const state = await getStatePageBySlug(slug);
  if (!state || !state.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(state.faqEntries);
  const stats: LocalStat[] = JSON.parse(state.localStats);

  // Sibling-state links — kills the orphan problem. Pick 11 other states
  // by alphabetical proximity around this slug, wrapping if needed.
  const allStates = await getPublishedStatePages();
  const sorted = [...allStates].sort((a, b) => a.stateName.localeCompare(b.stateName));
  const idx = sorted.findIndex((s) => s.slug === slug);
  const siblingPool = sorted.filter((s) => s.slug !== slug);
  const nearby: typeof sorted = [];
  if (siblingPool.length > 0) {
    const want = Math.min(11, siblingPool.length);
    for (let offset = 1; nearby.length < want && offset <= sorted.length; offset++) {
      const before = sorted[(idx - offset + sorted.length) % sorted.length];
      const after = sorted[(idx + offset) % sorted.length];
      if (before && before.slug !== slug && !nearby.find((n) => n.slug === before.slug)) nearby.push(before);
      if (nearby.length >= want) break;
      if (after && after.slug !== slug && !nearby.find((n) => n.slug === after.slug)) nearby.push(after);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={cashAdvanceProductSchema()} />
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
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-black mb-3">Availability</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{state.loanAvailability}</p>
        </section>
      )}

      <FaqAccordion entries={faqs} />

      {nearby.length > 0 && (
        <section className="mt-12 pt-8 border-t border-[#e4e4e7]">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-black mb-1">
            Cash advances in other states
          </h2>
          <p className="text-[13px] text-[#71717a] mb-4">
            Out of state? PennyLime serves all 50 states.{" "}
            <Link href="/states" className="text-[#15803d] font-semibold hover:underline">
              See all states →
            </Link>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {nearby.map((s) => (
              <Link
                key={s.id}
                href={`/states/${s.slug}`}
                className="group flex items-center justify-between rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 hover:border-[#15803d] hover:bg-[#f0fdf4] transition-colors"
              >
                <span className="text-[13px] font-medium text-[#0a0a0a] group-hover:text-[#15803d]">
                  {s.stateName}
                </span>
                <span className="text-[10px] font-mono text-[#a1a1aa] group-hover:text-[#15803d]">
                  {s.stateCode}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ContentCta />
    </div>
  );
}

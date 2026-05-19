export const revalidate = 3600;
// Allow on-demand generation for any newly-published slug that
// wasn't in generateStaticParams at build time (e.g. a platform Bar
// adds via the admin editor after deploy).
export const dynamicParams = true;

import { getPlatformPageBySlug, getPublishedPlatformPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, cashAdvanceProductSchema, faqSchema } from "@/components/seo/json-ld";
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
    title: platform.metaTitle || `Cash Advances for ${platform.platformName} Workers`,
    description: platform.metaDescription || platform.heroSubtext,
  }) as Metadata;
}

export default async function CashAdvancePlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = await getPlatformPageBySlug(slug);
  if (!platform || !platform.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(platform.faqEntries);

  return (
    <div className="min-h-screen bg-[#fafaf7]">
      {/* Hero */}
      <header className="bg-gradient-to-b from-[#f0fdf4] to-[#fafaf7] border-b border-[#e4e4e7]">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Cash Advance", href: "/cash-advance" },
              { label: platform.platformName, href: `/cash-advance/${platform.slug}` },
            ]}
          />
          <div className="mt-6 max-w-3xl">
            <span className="inline-block bg-[#15803d] text-white text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full">
              Built for {platform.platformName} workers
            </span>
            <h1 className="mt-4 text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em] text-[#0a0a0a] leading-[1.05]">
              {platform.heroHeadline}
            </h1>
            <p className="mt-4 text-[17px] md:text-[18px] text-[#52525b] leading-relaxed">
              {platform.heroSubtext}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/apply"
                className="inline-flex items-center gap-2 bg-[#15803d] text-white text-[15px] font-bold px-6 py-3.5 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_8px_20px_-8px_rgba(21,128,61,0.5)]"
              >
                {platform.ctaText || "Apply now"}
                <span aria-hidden>→</span>
              </Link>
              <span className="text-[13px] text-[#71717a]">No credit check · 5-minute application · Funds in as fast as 24h</span>
            </div>
          </div>
        </div>
      </header>

      <JsonLd data={cashAdvanceProductSchema()} />
      <JsonLd data={faqSchema(faqs)} />

      <main className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-16">
        {/* Stats strip */}
        {(platform.avgEarnings || platform.topEarnerRange) && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
            {platform.avgEarnings && (
              <div className="bg-white rounded-2xl p-5 border border-[#e4e4e7]">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#71717a] font-bold">
                  Typical {platform.platformName} earnings
                </p>
                <p className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-[#0a0a0a]">
                  {platform.avgEarnings}
                </p>
              </div>
            )}
            {platform.topEarnerRange && (
              <div className="bg-white rounded-2xl p-5 border border-[#e4e4e7]">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#71717a] font-bold">
                  Top earners
                </p>
                <p className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-[#0a0a0a]">
                  {platform.topEarnerRange}
                </p>
              </div>
            )}
          </section>
        )}

        {/* About */}
        <section className="mb-10">
          <h2 className="text-[24px] md:text-[28px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-3">
            Cash advances built for {platform.platformName}
          </h2>
          <p className="text-[15px] text-[#52525b] leading-relaxed">{platform.platformDescription}</p>
        </section>

        {/* How it works */}
        <section className="mb-10 bg-white rounded-2xl p-6 md:p-8 border border-[#e4e4e7]">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-5">
            How it works
          </h2>
          <ol className="space-y-4">
            {[
              { num: "1", title: "Apply in 5 minutes", body: `Tell us how much you need and link your bank account where your ${platform.platformName} earnings deposit.` },
              { num: "2", title: "Instant decision", body: "Our underwriting reads your deposit history. No credit check, no W-2 required. Most applicants hear back same day." },
              { num: "3", title: "Funds in as fast as 24 hours", body: "Once you accept, the ACH credit goes out to your linked bank account. Repay through small weekly debits over 4 to 12 weeks." },
            ].map((s) => (
              <li key={s.num} className="flex gap-4">
                <span className="flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#15803d] text-white text-[14px] font-bold">
                  {s.num}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0a0a0a]">{s.title}</h3>
                  <p className="mt-1 text-[14px] text-[#52525b] leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Loan details (HTML from CMS) */}
        {platform.loanDetailsHtml && (
          <section className="mb-10">
            <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-3">
              Advance details
            </h2>
            <div
              className="text-[14px] text-[#52525b] leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: platform.loanDetailsHtml }}
            />
          </section>
        )}

        {/* FAQ */}
        {faqs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[24px] md:text-[28px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-4">
              Frequently asked questions
            </h2>
            <FaqAccordion entries={faqs} />
          </section>
        )}

        <ContentCta text={platform.ctaText || undefined} subtext={platform.ctaSubtext || undefined} />
      </main>
    </div>
  );
}

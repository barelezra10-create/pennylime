export const dynamic = "force-dynamic";

import { getArticleBySlug, getPublishedArticles } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, articleSchema } from "@/components/seo/json-ld";
import { TableOfContents } from "@/components/content/table-of-contents";
import { ContentCta } from "@/components/content/content-cta";
import { ArticleCard } from "@/components/content/article-card";
import { LogoMark } from "@/components/brand/logo";
import { generateMeta } from "@/lib/seo";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateStaticParams() {
  const { articles } = await getPublishedArticles(undefined, 1, 1000);
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return generateMeta({
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || "",
    ogImage: article.ogImage || article.featuredImage,
    type: "article",
  }) as Metadata;
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || !article.published) notFound();

  const { articles: related } = await getPublishedArticles(undefined, 1, 6);
  const relatedFiltered = related.filter((a) => a.id !== article.id).slice(0, 3);

  // Add IDs to headings for TOC links
  const bodyWithIds = article.body.replace(
    /<(h[23])>(.*?)<\/\1>/g,
    (_, tag, text) => {
      const id = text.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<${tag} id="${id}">${text}</${tag}>`;
    }
  );

  // Insert inline CTAs into the body after every 3rd h2
  let h2Count = 0;
  const bodyWithCtas = bodyWithIds.replace(/<\/h2>/g, (match) => {
    h2Count++;
    if (h2Count === 2) {
      return match + `<div data-cta="banner"></div>`;
    }
    if (h2Count === 4) {
      return match + `<div data-cta="inline"></div>`;
    }
    return match;
  });

  const readTime = Math.max(1, Math.ceil(article.body.replace(/<[^>]*>/g, "").split(/\s+/).length / 200));

  return (
    <div className="bg-[#faf8f0]">
      {/* Hero banner */}
      <div className="relative bg-black overflow-hidden">
        {article.featuredImage && (
          <Image
            src={article.featuredImage}
            alt={article.title}
            fill
            className="object-cover opacity-40"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 pt-20 pb-16">
          <Breadcrumbs items={[
            { label: "Home", href: "/" },
            { label: "Blog", href: "/blog" },
            ...(article.category ? [{ label: article.category.name, href: `/blog/category/${article.category.slug}` }] : []),
            { label: article.title, href: `/blog/${article.slug}` },
          ]} />

          {article.category && (
            <Link
              href={`/blog/category/${article.category.slug}`}
              className="inline-block bg-[#15803d] text-white text-[11px] font-bold uppercase tracking-[0.06em] px-3 py-1.5 rounded-full mb-4 hover:bg-[#166534] transition-colors"
            >
              {article.category.name}
            </Link>
          )}

          <h1 className="text-[36px] md:text-[48px] font-extrabold tracking-[-0.04em] text-white leading-[1.05] mb-4 max-w-3xl">
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-[14px] text-white/70">
            {article.publishedAt && (
              <span>{new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            )}
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span>{readTime} min read</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10">
          {/* Article body */}
          <div>
            {/* TOC */}
            <TableOfContents html={article.body} />

            {/* Article content with enhanced typography */}
            <ArticleBody html={bodyWithCtas} />

            {/* End CTA */}
            <ContentCta />
          </div>

          {/* Sticky sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Apply card */}
              <div className="bg-white rounded-2xl border border-[#e4e4e7] p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <LogoMark size={24} />
                  <span className="text-[14px] font-extrabold tracking-[-0.02em]">Penny<span className="text-[#15803d]">Lime</span></span>
                </div>
                <p className="text-[15px] font-bold text-black mb-1">Need a loan?</p>
                <p className="text-[13px] text-[#71717a] mb-4">$100 - $10,000 for gig workers. No credit check required.</p>
                <Link href="/apply" className="block w-full bg-[#15803d] text-white text-center text-[13px] font-bold py-3 rounded-xl hover:bg-[#166534] transition-colors">
                  Apply Now
                </Link>
                <div className="flex justify-between mt-3 text-[11px] text-[#a1a1aa]">
                  <span>No credit check</span>
                  <span>48h funding</span>
                </div>
              </div>

              {/* Calculator link */}
              <Link href="/tools/loan-calculator" className="block bg-white rounded-2xl border border-[#e4e4e7] p-5 hover:shadow-sm transition-shadow">
                <p className="text-[13px] font-bold text-black mb-1">Loan Calculator</p>
                <p className="text-[12px] text-[#71717a]">See your weekly payments before you apply</p>
                <span className="text-[12px] font-bold text-[#15803d] mt-2 inline-block">Calculate &rarr;</span>
              </Link>

              {/* Tags */}
              {article.tags.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#e4e4e7] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((t) => (
                      <span key={t.tagId} className="text-[12px] bg-[#f4f4f5] text-[#52525b] rounded-full px-3 py-1 font-medium">
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Share */}
              <div className="bg-white rounded-2xl border border-[#e4e4e7] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Share</p>
                <div className="flex gap-2">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`https://pennylime.com/blog/${article.slug}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7] transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://pennylime.com/blog/${article.slug}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7] transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                  </a>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Related articles */}
        {relatedFiltered.length > 0 && (
          <section className="mt-16 pt-12 border-t border-[#e4e4e7]">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[24px] font-extrabold tracking-[-0.03em] text-black">Keep reading</h2>
              <Link href="/blog" className="text-[14px] font-bold text-[#15803d] hover:underline">View all &rarr;</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedFiltered.map((a) => (
                <ArticleCard key={a.id} title={a.title} slug={a.slug} excerpt={a.excerpt} featuredImage={a.featuredImage} publishedAt={a.publishedAt?.toISOString() || null} categoryName={a.category?.name} />
              ))}
            </div>
          </section>
        )}
      </div>

      <JsonLd data={articleSchema(article)} />
    </div>
  );
}

// Separate component to render article body with injected CTAs
function ArticleBody({ html }: { html: string }) {
  // Split on CTA markers and render React components between HTML chunks
  const parts = html.split(/<div data-cta="(banner|inline)"><\/div>/);

  return (
    <div>
      {parts.map((part, i) => {
        if (part === "banner") {
          return <ContentCta key={`cta-${i}`} variant="banner" text="Did you know?" subtext="PennyLime doesn't check your credit score. We verify your gig platform earnings directly. A low credit score won't hold you back from getting funded." />;
        }
        if (part === "inline") {
          return <ContentCta key={`cta-${i}`} variant="inline" text="Need cash between gigs?" subtext="$100 - $10,000. No credit check. Funded in 48 hours." />;
        }
        return (
          <article
            key={`body-${i}`}
            className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:tracking-[-0.02em] prose-headings:text-black prose-a:text-[#15803d] prose-strong:text-black prose-p:text-[#374151] prose-li:text-[#374151] prose-blockquote:border-[#15803d] prose-blockquote:bg-[#f0fdf4] prose-blockquote:rounded-xl prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:not-italic prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: part }}
          />
        );
      })}
    </div>
  );
}

export const dynamic = "force-dynamic";

import { getPublishedArticles, getCategories } from "@/actions/content";
import { ArticleCard } from "@/components/content/article-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = generateMeta({ title: "Blog", description: "Guides, tips, and resources for gig workers and 1099 contractors seeking loans." }) as Metadata;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const [{ articles, totalPages }, categories] = await Promise.all([
    getPublishedArticles(undefined, currentPage),
    getCategories(),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }]} />
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">Blog</h1>
      <p className="text-[14px] text-[#71717a] mb-6">Guides, tips, and resources for gig workers.</p>

      <div className="flex gap-3 mb-8">
        <Link href="/blog" className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#15803d] text-white">All</Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={`/blog/category/${cat.slug}`} className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]">
            {cat.name}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            title={article.title}
            slug={article.slug}
            excerpt={article.excerpt}
            featuredImage={article.featuredImage}
            publishedAt={article.publishedAt?.toISOString() || null}
            categoryName={article.category?.name}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => (
            <Link
              key={i}
              href={`/blog?page=${i + 1}`}
              className={`px-3 py-1.5 rounded text-[13px] ${currentPage === i + 1 ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a]"}`}
            >
              {i + 1}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export const dynamic = "force-dynamic";

import { getPublishedArticles, getCategories } from "@/actions/content";
import { ArticleCard } from "@/components/content/article-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = generateMeta({ title: "Blog", description: "Guides, tips, and resources for drivers, sellers, and operators seeking funding.", path: "/blog" }) as Metadata;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const [{ articles, totalPages }, categories] = await Promise.all([
    getPublishedArticles(undefined, currentPage),
    getCategories(),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-4 py-10 md:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }]} />
      <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">Blog</h1>
      <p className="text-[14px] text-[#52525b] mb-6">Guides, tips, and resources for drivers, sellers, and operators.</p>

      <div className="flex flex-wrap gap-2 md:gap-3 mb-8 -mx-1 overflow-x-auto pb-1">
        <Link href="/blog" className="shrink-0 text-[13px] font-medium px-3 py-2 rounded-full bg-[#15803d] text-white">All</Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={`/blog/category/${cat.slug}`} className="shrink-0 text-[13px] font-medium px-3 py-2 rounded-full bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7]">
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
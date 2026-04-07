export const dynamic = "force-dynamic";

import { getPublishedArticles, getCategories } from "@/actions/content";
import { ArticleCard } from "@/components/content/article-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return {};
  return generateMeta({ title: category.name, description: category.description || `Articles about ${category.name}` }) as Metadata;
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { articles, totalPages } = await getPublishedArticles(slug, currentPage);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: category.name, href: `/blog/category/${slug}` }]} />
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">{category.name}</h1>
      {category.description && <p className="text-[14px] text-[#71717a] mb-8">{category.description}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <ArticleCard key={article.id} title={article.title} slug={article.slug} excerpt={article.excerpt} featuredImage={article.featuredImage} publishedAt={article.publishedAt?.toISOString() || null} />
        ))}
      </div>
      {articles.length === 0 && <p className="text-[14px] text-[#71717a] py-12 text-center">No articles in this category yet.</p>}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => (
            <a
              key={i}
              href={`/blog/category/${slug}?page=${i + 1}`}
              className={`px-3 py-1.5 rounded text-[13px] ${currentPage === i + 1 ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a]"}`}
            >
              {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
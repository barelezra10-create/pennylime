import { getArticles } from "@/actions/content";
import { ArticlesClient } from "./articles-client";

export default async function ArticlesPage() {
  const articles = await getArticles();
  return <ArticlesClient articles={articles.map(a => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    published: a.published,
    publishedAt: a.publishedAt?.toISOString() || null,
    updatedAt: a.updatedAt.toISOString(),
    category: a.category ? { name: a.category.name } : null,
  }))} />;
}

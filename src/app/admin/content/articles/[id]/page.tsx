import { getArticle, getCategories, getTags } from "@/actions/content";
import { ArticleEditorClient } from "../new/article-editor-client";
import { notFound } from "next/navigation";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, categories, tags] = await Promise.all([
    getArticle(id),
    getCategories(),
    getTags(),
  ]);

  if (!article) notFound();

  return (
    <ArticleEditorClient
      article={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        body: article.body,
        excerpt: article.excerpt || "",
        featuredImage: article.featuredImage || "",
        categoryId: article.categoryId || "",
        metaTitle: article.metaTitle || "",
        metaDescription: article.metaDescription || "",
        ogImage: article.ogImage || "",
        published: article.published,
        publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 16) : "",
        tagIds: article.tags.map((t) => t.tagId),
      }}
      categories={categories}
      tags={tags}
    />
  );
}

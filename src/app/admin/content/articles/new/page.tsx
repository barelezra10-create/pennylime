import { getCategories, getTags } from "@/actions/content";
import { ArticleEditorClient } from "./article-editor-client";

export default async function NewArticlePage() {
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);
  return <ArticleEditorClient categories={categories} tags={tags} />;
}

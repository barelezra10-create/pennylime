import { getCategories, getTags } from "@/actions/content";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage() {
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);
  return <CategoriesClient initialCategories={categories} initialTags={tags} />;
}

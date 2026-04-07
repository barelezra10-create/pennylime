import { getComparisonPages } from "@/actions/content";
import { ComparisonsClient } from "./comparisons-client";

export default async function ComparisonsPage() {
  const comparisons = await getComparisonPages();
  return <ComparisonsClient comparisons={comparisons.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    entityA: c.entityA,
    entityB: c.entityB,
    published: c.published,
    updatedAt: c.updatedAt.toISOString(),
  }))} />;
}

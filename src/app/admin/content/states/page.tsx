import { getStatePages } from "@/actions/content";
import { StatesClient } from "./states-client";

export default async function StatesPage() {
  const states = await getStatePages();
  return <StatesClient states={states.map((s) => ({
    id: s.id,
    stateName: s.stateName,
    stateCode: s.stateCode,
    slug: s.slug,
    published: s.published,
    updatedAt: s.updatedAt.toISOString(),
  }))} />;
}

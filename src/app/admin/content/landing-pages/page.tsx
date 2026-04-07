import { getLandingPages } from "@/actions/content";
import { LandingPagesClient } from "./landing-pages-client";

export default async function LandingPagesPage() {
  const pages = await getLandingPages();
  return (
    <LandingPagesClient
      pages={pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        metaTitle: p.metaTitle,
        utmCampaign: p.utmCampaign,
        published: p.published,
        updatedAt: p.updatedAt.toISOString(),
      }))}
    />
  );
}

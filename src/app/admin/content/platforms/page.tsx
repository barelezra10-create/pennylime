import { getPlatformPages } from "@/actions/content";
import { PlatformsClient } from "./platforms-client";

export default async function PlatformsPage() {
  const platforms = await getPlatformPages();
  return <PlatformsClient platforms={platforms.map((p) => ({
    id: p.id,
    platformName: p.platformName,
    slug: p.slug,
    published: p.published,
    updatedAt: p.updatedAt.toISOString(),
  }))} />;
}

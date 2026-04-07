import { Homepage } from "@/components/homepage/homepage";
import { getPublishedArticles, getPublishedPlatformPages } from "@/actions/content";
import { JsonLd, organizationSchema, loanProductSchema } from "@/components/seo/json-ld";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ articles }, platforms] = await Promise.all([
    getPublishedArticles(undefined, 1, 3),
    getPublishedPlatformPages(),
  ]);

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={loanProductSchema()} />
      <Homepage
        latestArticles={articles.map((a) => ({
          title: a.title,
          slug: a.slug,
          excerpt: a.excerpt,
          featuredImage: a.featuredImage,
          publishedAt: a.publishedAt?.toISOString() || null,
          categoryName: a.category?.name || null,
        }))}
        platforms={platforms.map((p) => ({ name: p.platformName, slug: p.slug }))}
      />
    </>
  );
}

import { prisma } from "@/lib/db";

export async function GET() {
  const [articles, platforms, states, tools, comparisons, categories] = await Promise.all([
    prisma.article.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.platformPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.statePage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.toolPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.comparisonPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ select: { slug: true } }),
  ]);

  const base = "https://pennylime.com";

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/apply", priority: "0.9", changefreq: "monthly" },
    { url: "/cash-advance", priority: "0.9", changefreq: "weekly" },
    { url: "/states", priority: "0.85", changefreq: "weekly" },
    { url: "/tools", priority: "0.8", changefreq: "weekly" },
    { url: "/blog", priority: "0.8", changefreq: "daily" },
    { url: "/compare", priority: "0.7", changefreq: "weekly" },
    { url: "/status", priority: "0.5", changefreq: "monthly" },
    { url: "/agreement", priority: "0.4", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/disclosures", priority: "0.3", changefreq: "yearly" },
    { url: "/security", priority: "0.3", changefreq: "yearly" },
    { url: "/security/access-controls", priority: "0.3", changefreq: "yearly" },
    { url: "/security/data-retention", priority: "0.3", changefreq: "yearly" },
  ];

  const urls = [
    ...staticPages.map((p) => `
    <url>
      <loc>${base}${p.url}</loc>
      <changefreq>${p.changefreq}</changefreq>
      <priority>${p.priority}</priority>
    </url>`),
    ...articles.map((a) => `
    <url>
      <loc>${base}/blog/${a.slug}</loc>
      <lastmod>${a.updatedAt.toISOString()}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
    </url>`),
    ...platforms.map((p) => `
    <url>
      <loc>${base}/cash-advance/${p.slug}</loc>
      <lastmod>${p.updatedAt.toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.85</priority>
    </url>`),
    ...states.map((s) => `
    <url>
      <loc>${base}/states/${s.slug}</loc>
      <lastmod>${s.updatedAt.toISOString()}</lastmod>
      <priority>0.7</priority>
    </url>`),
    ...tools.map((t) => `
    <url>
      <loc>${base}/tools/${t.slug}</loc>
      <lastmod>${t.updatedAt.toISOString()}</lastmod>
      <priority>0.6</priority>
    </url>`),
    ...comparisons.map((c) => `
    <url>
      <loc>${base}/compare/${c.slug}</loc>
      <lastmod>${c.updatedAt.toISOString()}</lastmod>
      <priority>0.6</priority>
    </url>`),
    ...categories.map((c) => `
    <url>
      <loc>${base}/blog/category/${c.slug}</loc>
      <priority>0.5</priority>
    </url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

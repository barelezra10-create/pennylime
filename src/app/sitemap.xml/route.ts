import { prisma } from "@/lib/db";

export async function GET() {
  const [articles, platforms, states, tools, comparisons] = await Promise.all([
    prisma.article.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.platformPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.statePage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.toolPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.comparisonPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
  ]);

  const base = "https://pennylime.com";

  const staticPages = [
    { url: "/", priority: "1.0" },
    { url: "/apply", priority: "0.9" },
    { url: "/blog", priority: "0.8" },
    { url: "/privacy", priority: "0.3" },
    { url: "/terms", priority: "0.3" },
    { url: "/disclosures", priority: "0.3" },
  ];

  const urls = [
    ...staticPages.map((p) => `
    <url>
      <loc>${base}${p.url}</loc>
      <priority>${p.priority}</priority>
    </url>`),
    ...articles.map((a) => `
    <url>
      <loc>${base}/blog/${a.slug}</loc>
      <lastmod>${a.updatedAt.toISOString()}</lastmod>
      <priority>0.7</priority>
    </url>`),
    ...platforms.map((p) => `
    <url>
      <loc>${base}/loans/${p.slug}</loc>
      <lastmod>${p.updatedAt.toISOString()}</lastmod>
      <priority>0.8</priority>
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
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

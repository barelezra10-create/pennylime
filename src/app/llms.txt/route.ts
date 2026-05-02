import { prisma } from "@/lib/db";

const BASE = "https://pennylime.com";

export async function GET() {
  const [articles, platforms, states, tools, comparisons] = await Promise.all([
    prisma.article.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.platformPage.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, platformName: true, heroSubtext: true, platformDescription: true },
      orderBy: { platformName: "asc" },
    }),
    prisma.statePage.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, stateName: true, heroSubtext: true },
      orderBy: { stateName: "asc" },
    }),
    prisma.toolPage.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, title: true, description: true },
      orderBy: { title: "asc" },
    }),
    prisma.comparisonPage.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, title: true, entityA: true, entityB: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const trim = (s: string | null | undefined, max = 140) => {
    if (!s) return "";
    const clean = s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
  };

  const sections: string[] = [];

  sections.push(`# PennyLime`);
  sections.push(
    `> Merchant cash advances of $500 to $10,000 for gig workers, 1099 contractors, and small businesses. PennyLime purchases a portion of your future receivables at a discount and delivers funds in as fast as 48 hours, with repayment as a fixed percentage of your future earnings. PennyLime does not offer loans or extend credit. Owned and operated by 770 Technology Way LLC, a Florida limited liability company.`
  );

  sections.push(`## Apply`);
  sections.push(`- [Apply for a loan](${BASE}/apply): 5-minute application, decision the same day, funded within 48 hours.`);

  if (platforms.length) {
    sections.push(`## Loans by gig platform`);
    sections.push(
      platforms
        .map(
          (p) =>
            `- [${p.platformName} loans](${BASE}/loans/${p.slug}): ${trim(p.heroSubtext) || trim(p.platformDescription)}`
        )
        .join("\n")
    );
  }

  if (tools.length) {
    sections.push(`## Free tools and calculators`);
    sections.push(tools.map((t) => `- [${t.title}](${BASE}/tools/${t.slug}): ${trim(t.description)}`).join("\n"));
  }

  if (comparisons.length) {
    sections.push(`## Compare PennyLime`);
    sections.push(
      comparisons
        .map((c) => `- [${c.title}](${BASE}/compare/${c.slug}): How PennyLime stacks up against ${c.entityB}.`)
        .join("\n")
    );
  }

  if (states.length) {
    sections.push(`## State loan guides`);
    sections.push(states.map((s) => `- [${s.stateName} loans](${BASE}/states/${s.slug}): ${trim(s.heroSubtext)}`).join("\n"));
  }

  if (articles.length) {
    sections.push(`## Articles and guides`);
    sections.push(articles.map((a) => `- [${a.title}](${BASE}/blog/${a.slug}): ${trim(a.excerpt)}`).join("\n"));
  }

  sections.push(`## Legal`);
  sections.push(
    [
      `- [Privacy policy](${BASE}/privacy)`,
      `- [Terms of service](${BASE}/terms)`,
      `- [Disclosures](${BASE}/disclosures)`,
      `- [Information security policy](${BASE}/security)`,
    ].join("\n")
  );

  sections.push(`## Optional`);
  sections.push(`- [Full content (llms-full.txt)](${BASE}/llms-full.txt): Complete article and page content concatenated for ingestion.`);

  const body = sections.join("\n\n") + "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

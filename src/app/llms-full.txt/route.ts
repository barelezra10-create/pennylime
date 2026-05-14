import { prisma } from "@/lib/db";

const BASE = "https://pennylime.com";

const stripHtml = (s: string | null | undefined) => {
  if (!s) return "";
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export async function GET() {
  const [articles, platforms, states, tools, comparisons] = await Promise.all([
    prisma.article.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, title: true, excerpt: true, body: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.platformPage.findMany({
      where: { published: true, noIndex: false },
      select: {
        slug: true,
        platformName: true,
        heroHeadline: true,
        heroSubtext: true,
        platformDescription: true,
        avgEarnings: true,
        topEarnerRange: true,
        loanDetailsHtml: true,
        faqEntries: true,
      },
      orderBy: { platformName: "asc" },
    }),
    prisma.statePage.findMany({
      where: { published: true, noIndex: false },
      select: {
        slug: true,
        stateName: true,
        heroHeadline: true,
        heroSubtext: true,
        regulationsSummary: true,
        loanAvailability: true,
        faqEntries: true,
      },
      orderBy: { stateName: "asc" },
    }),
    prisma.toolPage.findMany({
      where: { published: true, noIndex: false },
      select: { slug: true, title: true, description: true, body: true },
      orderBy: { title: "asc" },
    }),
    prisma.comparisonPage.findMany({
      where: { published: true, noIndex: false },
      select: {
        slug: true,
        title: true,
        entityA: true,
        entityB: true,
        introHtml: true,
        comparisonGrid: true,
        verdict: true,
        faqEntries: true,
      },
      orderBy: { title: "asc" },
    }),
  ]);

  const formatFaqs = (raw: string | null | undefined) => {
    if (!raw) return "";
    try {
      const arr = JSON.parse(raw) as Array<{ question?: string; answer?: string; q?: string; a?: string }>;
      if (!Array.isArray(arr) || arr.length === 0) return "";
      return arr
        .map((f) => {
          const q = f.question || f.q || "";
          const a = f.answer || f.a || "";
          if (!q || !a) return "";
          return `**${q}**\n${stripHtml(a)}`;
        })
        .filter(Boolean)
        .join("\n\n");
    } catch {
      return "";
    }
  };

  const out: string[] = [];

  out.push(`# PennyLime — Full Content Export`);
  out.push(
    `> Merchant cash advances of $500 to $10,000 for gig workers, 1099 contractors, and small businesses. PennyLime purchases a portion of your future receivables at a discount and delivers funds in as fast as 48 hours, with repayment as a fixed percentage of your future earnings. PennyLime does not extend credit. Owned and operated by 770 Technology Way LLC, a Florida limited liability company.`
  );
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`Site: ${BASE}`);

  if (platforms.length) {
    out.push(`\n---\n\n# Cash advances by gig platform`);
    for (const p of platforms) {
      out.push(`## ${p.platformName}`);
      out.push(`URL: ${BASE}/advances/${p.slug}`);
      if (p.heroHeadline) out.push(`### ${p.heroHeadline}`);
      if (p.heroSubtext) out.push(stripHtml(p.heroSubtext));
      if (p.platformDescription) out.push(stripHtml(p.platformDescription));
      if (p.avgEarnings || p.topEarnerRange) {
        const lines: string[] = [];
        if (p.avgEarnings) lines.push(`- Average earnings: ${p.avgEarnings}`);
        if (p.topEarnerRange) lines.push(`- Top earner range: ${p.topEarnerRange}`);
        out.push(lines.join("\n"));
      }
      if (p.loanDetailsHtml) out.push(stripHtml(p.loanDetailsHtml));
      const faq = formatFaqs(p.faqEntries);
      if (faq) {
        out.push(`### FAQ`);
        out.push(faq);
      }
    }
  }

  if (tools.length) {
    out.push(`\n---\n\n# Tools and calculators`);
    for (const t of tools) {
      out.push(`## ${t.title}`);
      out.push(`URL: ${BASE}/tools/${t.slug}`);
      if (t.description) out.push(stripHtml(t.description));
      if (t.body) out.push(stripHtml(t.body));
    }
  }

  if (comparisons.length) {
    out.push(`\n---\n\n# Comparisons`);
    for (const c of comparisons) {
      out.push(`## ${c.title}`);
      out.push(`URL: ${BASE}/compare/${c.slug}`);
      out.push(`Comparing: ${c.entityA} vs ${c.entityB}`);
      if (c.introHtml) out.push(stripHtml(c.introHtml));
      if (c.verdict) out.push(`### Verdict\n${stripHtml(c.verdict)}`);
      const faq = formatFaqs(c.faqEntries);
      if (faq) {
        out.push(`### FAQ`);
        out.push(faq);
      }
    }
  }

  if (states.length) {
    out.push(`\n---\n\n# State guides`);
    for (const s of states) {
      out.push(`## ${s.stateName}`);
      out.push(`URL: ${BASE}/states/${s.slug}`);
      if (s.heroHeadline) out.push(`### ${s.heroHeadline}`);
      if (s.heroSubtext) out.push(stripHtml(s.heroSubtext));
      if (s.regulationsSummary) {
        out.push(`### Regulations`);
        out.push(stripHtml(s.regulationsSummary));
      }
      if (s.loanAvailability) {
        out.push(`### Availability`);
        out.push(stripHtml(s.loanAvailability));
      }
      const faq = formatFaqs(s.faqEntries);
      if (faq) {
        out.push(`### FAQ`);
        out.push(faq);
      }
    }
  }

  if (articles.length) {
    out.push(`\n---\n\n# Articles`);
    for (const a of articles) {
      out.push(`## ${a.title}`);
      out.push(`URL: ${BASE}/blog/${a.slug}`);
      if (a.publishedAt) out.push(`Published: ${a.publishedAt.toISOString().split("T")[0]}`);
      if (a.excerpt) out.push(`> ${stripHtml(a.excerpt)}`);
      if (a.body) out.push(stripHtml(a.body));
    }
  }

  out.push(`\n---\n\n# Legal`);
  out.push(`- Privacy policy: ${BASE}/privacy`);
  out.push(`- Terms of service: ${BASE}/terms`);
  out.push(`- Disclosures: ${BASE}/disclosures`);

  const body = out.join("\n\n") + "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

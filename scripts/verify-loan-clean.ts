import { prisma } from "../src/lib/db";

const RE = /\bloan|loans\b/i;

async function main() {
  let issues = 0;

  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { title: { contains: "loan", mode: "insensitive" } },
        { body: { contains: "loan", mode: "insensitive" } },
        { excerpt: { contains: "loan", mode: "insensitive" } },
        { metaTitle: { contains: "loan", mode: "insensitive" } },
        { metaDescription: { contains: "loan", mode: "insensitive" } },
        { slug: { contains: "loan", mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true },
  });
  if (articles.length > 0) {
    console.log(`⚠️  ${articles.length} articles still contain 'loan':`);
    for (const a of articles) console.log(`   - ${a.slug}: ${a.title}`);
    issues += articles.length;
  }

  const platforms = await prisma.platformPage.findMany({
    where: {
      OR: [
        { platformDescription: { contains: "loan", mode: "insensitive" } },
        { heroHeadline: { contains: "loan", mode: "insensitive" } },
        { heroSubtext: { contains: "loan", mode: "insensitive" } },
        { loanDetailsHtml: { contains: "loan", mode: "insensitive" } },
        { faqEntries: { contains: "loan", mode: "insensitive" } },
        { metaTitle: { contains: "loan", mode: "insensitive" } },
        { metaDescription: { contains: "loan", mode: "insensitive" } },
        { slug: { contains: "loan", mode: "insensitive" } },
      ],
    },
    select: { slug: true },
  });
  if (platforms.length > 0) {
    console.log(`⚠️  ${platforms.length} PlatformPages still contain 'loan': ${platforms.map((p) => p.slug).join(", ")}`);
    issues += platforms.length;
  }

  const states = await prisma.statePage.findMany({
    where: {
      OR: [
        { heroSubtext: { contains: "loan", mode: "insensitive" } },
        { loanAvailability: { contains: "loan", mode: "insensitive" } },
        { regulationsSummary: { contains: "loan", mode: "insensitive" } },
        { faqEntries: { contains: "loan", mode: "insensitive" } },
        { metaTitle: { contains: "loan", mode: "insensitive" } },
        { metaDescription: { contains: "loan", mode: "insensitive" } },
      ],
    },
    select: { slug: true },
  });
  if (states.length > 0) {
    console.log(`⚠️  ${states.length} StatePages still contain 'loan': ${states.map((s) => s.slug).join(", ")}`);
    issues += states.length;
  }

  const tools = await prisma.toolPage.findMany({
    where: {
      OR: [
        { title: { contains: "loan", mode: "insensitive" } },
        { description: { contains: "loan", mode: "insensitive" } },
        { body: { contains: "loan", mode: "insensitive" } },
        { metaTitle: { contains: "loan", mode: "insensitive" } },
        { metaDescription: { contains: "loan", mode: "insensitive" } },
        { slug: { contains: "loan", mode: "insensitive" } },
        { toolComponent: { contains: "loan", mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, toolComponent: true },
  });
  if (tools.length > 0) {
    console.log(`⚠️  ${tools.length} ToolPages still contain 'loan':`);
    for (const t of tools) console.log(`   - ${t.slug} (${t.toolComponent}): ${t.title}`);
    issues += tools.length;
  }

  const landings = await prisma.landingPage.findMany({
    where: {
      OR: [
        { heroSubtext: { contains: "loan", mode: "insensitive" } },
        { heroBadge: { contains: "loan", mode: "insensitive" } },
        { metaTitle: { contains: "loan", mode: "insensitive" } },
        { metaDescription: { contains: "loan", mode: "insensitive" } },
        { faqs: { contains: "loan", mode: "insensitive" } },
        { howItWorksSteps: { contains: "loan", mode: "insensitive" } },
        { testimonials: { contains: "loan", mode: "insensitive" } },
        { trustItems: { contains: "loan", mode: "insensitive" } },
        { slug: { contains: "loan", mode: "insensitive" } },
      ],
    },
    select: { slug: true },
  });
  if (landings.length > 0) {
    console.log(`⚠️  ${landings.length} LandingPages still contain 'loan': ${landings.map((l) => l.slug).join(", ")}`);
    issues += landings.length;
  }

  if (issues === 0) console.log("✓ All scanned DB content is loan-free.");
  await prisma.$disconnect();
  process.exit(issues > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

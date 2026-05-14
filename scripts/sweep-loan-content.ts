import { prisma } from "../src/lib/db";

/**
 * Sweeps all customer-facing DB content to replace "loan" terminology
 * with "cash advance" / "advance". PennyLime is a cash advance product,
 * not a loan, so the word must not appear anywhere customer-visible.
 *
 * Internal database column names (loanAmount, loanTermMonths, ssnHash,
 * etc.) are NOT touched — those are field names, not content.
 */

const REPLACEMENTS: Array<[RegExp, string]> = [
  // URL-style strings (catch before word boundaries kick in)
  [/\/loans\//g, "/advances/"],
  [/loan-calculator/g, "advance-calculator"],
  [/loan-comparison/g, "advance-comparison"],
  [/loan-affordability-calculator/g, "advance-affordability-calculator"],
  // Longest-word matches first (whole-word, case-sensitive)
  [/\bPersonal Loans\b/g, "Cash Advances"],
  [/\bpersonal loans\b/g, "cash advances"],
  [/\bPersonal Loan\b/g, "Cash Advance"],
  [/\bpersonal loan\b/g, "cash advance"],
  [/\bLoans\b/g, "Advances"],
  [/\bloans\b/g, "advances"],
  [/\bLoan\b/g, "Advance"],
  [/\bloan\b/g, "advance"],
];

function transform(s: string | null | undefined): { changed: boolean; value: string | null | undefined } {
  if (s == null) return { changed: false, value: s };
  let v = s;
  for (const [re, replacement] of REPLACEMENTS) v = v.replace(re, replacement);
  return { changed: v !== s, value: v };
}

function applyToFields<T extends Record<string, unknown>>(
  row: T,
  fields: (keyof T)[],
): { changed: boolean; updates: Partial<T>; diffs: Array<{ field: string; before: string; after: string }> } {
  const updates: Partial<T> = {};
  const diffs: Array<{ field: string; before: string; after: string }> = [];
  let changed = false;
  for (const f of fields) {
    const value = row[f];
    if (typeof value !== "string") continue;
    const { changed: c, value: nv } = transform(value);
    if (c && nv != null) {
      changed = true;
      (updates as Record<string, unknown>)[f as string] = nv;
      diffs.push({
        field: f as string,
        before: value.slice(0, 80) + (value.length > 80 ? "…" : ""),
        after: (nv as string).slice(0, 80) + ((nv as string).length > 80 ? "…" : ""),
      });
    }
  }
  return { changed, updates, diffs };
}

async function sweepArticles() {
  const rows = await prisma.article.findMany();
  let touched = 0;
  for (const row of rows) {
    const { changed, updates, diffs } = applyToFields(row, [
      "title",
      "body",
      "excerpt",
      "metaTitle",
      "metaDescription",
    ]);
    if (changed) {
      await prisma.article.update({ where: { id: row.id }, data: updates });
      touched++;
      console.log(`  Article ${row.slug}:`, diffs.map((d) => d.field).join(", "));
    }
  }
  console.log(`Articles: ${touched}/${rows.length} updated`);
}

async function sweepPlatformPages() {
  const rows = await prisma.platformPage.findMany();
  let touched = 0;
  for (const row of rows) {
    const { changed, updates, diffs } = applyToFields(row, [
      "heroHeadline",
      "heroSubtext",
      "platformDescription",
      "avgEarnings",
      "topEarnerRange",
      "loanDetailsHtml",
      "faqEntries",
      "ctaText",
      "ctaSubtext",
      "metaTitle",
      "metaDescription",
    ]);
    if (changed) {
      await prisma.platformPage.update({ where: { id: row.id }, data: updates });
      touched++;
      console.log(`  PlatformPage ${row.slug}:`, diffs.map((d) => d.field).join(", "));
    }
  }
  console.log(`PlatformPages: ${touched}/${rows.length} updated`);
}

async function sweepStatePages() {
  const rows = await prisma.statePage.findMany();
  let touched = 0;
  for (const row of rows) {
    const { changed, updates, diffs } = applyToFields(row, [
      "heroHeadline",
      "heroSubtext",
      "regulationsSummary",
      "loanAvailability",
      "localStats",
      "faqEntries",
      "ctaText",
      "metaTitle",
      "metaDescription",
    ]);
    if (changed) {
      await prisma.statePage.update({ where: { id: row.id }, data: updates });
      touched++;
      console.log(`  StatePage ${row.slug}:`, diffs.map((d) => d.field).join(", "));
    }
  }
  console.log(`StatePages: ${touched}/${rows.length} updated`);
}

async function sweepToolPages() {
  const rows = await prisma.toolPage.findMany();
  let touched = 0;
  for (const row of rows) {
    const { changed, updates, diffs } = applyToFields(row, [
      "title",
      "description",
      "body",
      "metaTitle",
      "metaDescription",
      "slug",
      "toolComponent",
    ]);
    if (changed) {
      await prisma.toolPage.update({ where: { id: row.id }, data: updates });
      touched++;
      console.log(`  ToolPage ${row.slug} → ${updates.slug ?? row.slug}:`, diffs.map((d) => d.field).join(", "));
    }
  }
  console.log(`ToolPages: ${touched}/${rows.length} updated`);
}

async function sweepLandingPages() {
  const rows = await prisma.landingPage.findMany();
  let touched = 0;
  for (const row of rows) {
    const { changed, updates, diffs } = applyToFields(row, [
      "heroBadge",
      "heroHeadlineLine1",
      "heroHeadlineLine2",
      "heroHeadlineLine3",
      "heroSubtext",
      "trustItems",
      "trustStats",
      "howItWorksTitle",
      "howItWorksSubtext",
      "howItWorksSteps",
      "testimonialsTitle",
      "testimonials",
      "faqTitle",
      "faqs",
      "finalCtaHeadline",
      "finalCtaSubtext",
      "finalCtaButtonText",
      "metaTitle",
      "metaDescription",
    ]);
    if (changed) {
      await prisma.landingPage.update({ where: { id: row.id }, data: updates });
      touched++;
      console.log(`  LandingPage ${row.slug}:`, diffs.map((d) => d.field).join(", "));
    }
  }
  console.log(`LandingPages: ${touched}/${rows.length} updated`);
}

async function main() {
  console.log("Starting content sweep…\n");
  await sweepArticles();
  await sweepPlatformPages();
  await sweepStatePages();
  await sweepToolPages();
  await sweepLandingPages();
  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

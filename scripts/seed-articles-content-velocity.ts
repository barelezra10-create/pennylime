// One-shot seed: 30 SEO articles from the May 2026 content-velocity push.
// Reads JSON in scripts/seed-data/batch-*.json and upserts each article by
// slug. Safe to re-run: existing slugs get updated, new ones inserted.
//
// Run locally:  npx tsx scripts/seed-articles-content-velocity.ts
// Run on prod:  set DATABASE_URL to Railway Postgres external URL first

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || ""),
});

type SeedArticle = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: string;
  categorySlug: string;
  authorName?: string;
};

async function main() {
  const dataDir = path.join(__dirname, "seed-data");
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();

  const allArticles: SeedArticle[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dataDir, f), "utf-8");
    const parsed = JSON.parse(raw) as SeedArticle[];
    allArticles.push(...parsed);
  }

  console.log(`Loaded ${allArticles.length} articles from ${files.length} batches`);

  // Map category slug -> id
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const catMap = new Map(categories.map((c) => [c.slug, c.id]));

  for (const slug of new Set(allArticles.map((a) => a.categorySlug))) {
    if (!catMap.has(slug)) {
      throw new Error(`Category not found in DB: ${slug}. Run seed-content.ts first.`);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const a of allArticles) {
    const categoryId = catMap.get(a.categorySlug)!;

    const existing = await prisma.article.findUnique({
      where: { slug: a.slug },
      select: { id: true, contentGenerated: true },
    });

    if (existing) {
      await prisma.article.update({
        where: { slug: a.slug },
        data: {
          title: a.title,
          body: a.body,
          excerpt: a.excerpt,
          metaTitle: a.metaTitle,
          metaDescription: a.metaDescription,
          categoryId,
          published: true,
          publishedAt: existing.contentGenerated ? undefined : new Date(),
          contentGenerated: true,
        },
      });
      updated++;
      console.log(`  ↻ updated: ${a.slug}`);
    } else {
      await prisma.article.create({
        data: {
          title: a.title,
          slug: a.slug,
          body: a.body,
          excerpt: a.excerpt,
          metaTitle: a.metaTitle,
          metaDescription: a.metaDescription,
          categoryId,
          published: true,
          publishedAt: new Date(),
          contentGenerated: true,
        },
      });
      inserted++;
      console.log(`  + inserted: ${a.slug}`);
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

// Set featuredImage = /blog-images/{slug}.png for the 30 May 2026 articles.
// Run after images are committed to public/blog-images/.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || ""),
});

async function main() {
  const dataDir = path.join(__dirname, "seed-data");
  const slugs: string[] = [];
  for (const f of fs.readdirSync(dataDir).filter((f) => f.startsWith("batch-") && f.endsWith(".json"))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf-8")) as { slug: string }[];
    for (const a of parsed) slugs.push(a.slug);
  }

  let updated = 0;
  for (const slug of slugs) {
    const url = `/blog-images/${slug}.png`;
    const res = await prisma.article.updateMany({
      where: { slug },
      data: { featuredImage: url, ogImage: url },
    });
    if (res.count > 0) updated++;
    console.log(`${res.count > 0 ? "✓" : "✗"} ${slug}`);
  }
  console.log(`\nUpdated ${updated}/${slugs.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

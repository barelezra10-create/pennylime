import { prisma } from "../src/lib/db";

/**
 * Renames article slugs that contain "loan" to use "advance" instead, and
 * prints the redirect map so it can be wired into next.config.
 */

function renameSlug(slug: string): string {
  return slug
    .replace(/\bpersonal-loans?\b/g, "cash-advance")
    .replace(/\bloans\b/g, "advances")
    .replace(/\bloan\b/g, "advance");
}

async function main() {
  const articles = await prisma.article.findMany({ select: { id: true, slug: true } });
  const rename: Array<{ id: string; oldSlug: string; newSlug: string }> = [];
  for (const a of articles) {
    if (!/\bloan|loans\b/.test(a.slug)) continue;
    const newSlug = renameSlug(a.slug);
    if (newSlug === a.slug) continue;
    rename.push({ id: a.id, oldSlug: a.slug, newSlug });
  }

  if (rename.length === 0) {
    console.log("No article slugs to rename.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Renaming ${rename.length} article slugs:`);
  for (const r of rename) console.log(`  ${r.oldSlug}  →  ${r.newSlug}`);

  // Detect collisions before changing anything
  const newSlugs = rename.map((r) => r.newSlug);
  const existing = await prisma.article.findMany({
    where: { slug: { in: newSlugs } },
    select: { slug: true },
  });
  if (existing.length > 0) {
    console.error("\nCollision: new slugs already exist on other articles:");
    for (const e of existing) console.error(`  ${e.slug}`);
    console.error("Aborting. Resolve manually.");
    process.exit(1);
  }

  for (const r of rename) {
    await prisma.article.update({ where: { id: r.id }, data: { slug: r.newSlug } });
  }
  console.log(`\nUpdated ${rename.length} articles.`);

  console.log("\nRedirect map (paste into next.config.ts redirects()):");
  for (const r of rename) {
    console.log(`  { source: "/blog/${r.oldSlug}", destination: "/blog/${r.newSlug}", permanent: true },`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { prisma } from "../src/lib/db";

async function main() {
  // Find the lingering article and report what field still has "loan"
  const art = await prisma.article.findUnique({
    where: { slug: "gig-workers-business-advances-complete-guide" },
  });
  if (art) {
    const fields: Array<keyof typeof art> = ["title", "body", "excerpt", "metaTitle", "metaDescription", "slug"];
    for (const f of fields) {
      const v = art[f];
      if (typeof v === "string" && /loan/i.test(v)) {
        const matches = v.match(/.{0,30}loan.{0,30}/gi);
        console.log(`Article.${String(f)}:`);
        matches?.forEach((m) => console.log(`  …${m}…`));
      }
    }
  }

  // Rename the landing page slug
  const lp = await prisma.landingPage.findUnique({
    where: { slug: "uber-lyft-driver-loans" },
  });
  if (lp) {
    const newSlug = "uber-lyft-driver-advances";
    const collision = await prisma.landingPage.findUnique({ where: { slug: newSlug } });
    if (collision) {
      console.log(`Collision: ${newSlug} already exists, leaving slug alone`);
    } else {
      await prisma.landingPage.update({ where: { id: lp.id }, data: { slug: newSlug } });
      console.log(`Renamed landing page: uber-lyft-driver-loans → ${newSlug}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

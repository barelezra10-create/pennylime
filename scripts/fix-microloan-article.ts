import { prisma } from "../src/lib/db";

async function main() {
  const slug = "gig-workers-business-advances-complete-guide";
  const art = await prisma.article.findUnique({ where: { slug } });
  if (!art) {
    console.log("Article not found");
    return;
  }
  const newBody = art.body
    // SBA Microloan is a specific government program name — rephrase
    // to remove the word while preserving the factual reference.
    .replace(/<h3>Microloans<\/h3>/g, "<h3>SBA small-dollar programs</h3>")
    .replace(/SBA microloan program intermediaries/g, "SBA small-dollar program intermediaries")
    .replace(/The SBA microloan program specifically/g, "The SBA's small-dollar program specifically")
    .replace(/Microloans/g, "SBA small-dollar programs")
    .replace(/microloan program/g, "small-dollar program")
    .replace(/microloans/g, "small-dollar funding")
    .replace(/microloan/g, "small-dollar funding");

  if (newBody === art.body) {
    console.log("No changes to apply");
    return;
  }
  await prisma.article.update({ where: { id: art.id }, data: { body: newBody } });
  console.log("Article body updated");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

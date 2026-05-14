import { prisma } from "../src/lib/db";

async function main() {
  const rules = await prisma.loanRule.findMany({ orderBy: { key: "asc" } });
  console.table(rules.map(r => ({ key: r.key, value: r.value, description: r.description.slice(0, 50) })));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

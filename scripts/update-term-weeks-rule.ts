import { prisma } from "../src/lib/db";

async function main() {
  await prisma.loanRule.upsert({
    where: { key: "max_term_weeks" },
    update: { value: "16", description: "Maximum advance term in weeks" },
    create: { key: "max_term_weeks", value: "16", description: "Maximum advance term in weeks" },
  });
  await prisma.loanRule.deleteMany({ where: { key: "max_loan_term_months" } });
  const rules = await prisma.loanRule.findMany({ orderBy: { key: "asc" } });
  console.table(rules.map((r) => ({ key: r.key, value: r.value })));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

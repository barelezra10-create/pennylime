import { prisma } from "../src/lib/db";

async function main() {
  await prisma.loanRule.upsert({
    where: { key: "min_weekly_rate" },
    update: { value: "4", description: "Floor weekly rate (% compounded on outstanding balance, best-risk borrowers)" },
    create: { key: "min_weekly_rate", value: "4", description: "Floor weekly rate (% compounded on outstanding balance, best-risk borrowers)" },
  });
  await prisma.loanRule.upsert({
    where: { key: "max_weekly_rate" },
    update: { value: "10", description: "Ceiling weekly rate (% compounded on outstanding balance, highest-risk borrowers)" },
    create: { key: "max_weekly_rate", value: "10", description: "Ceiling weekly rate (% compounded on outstanding balance, highest-risk borrowers)" },
  });

  await prisma.loanRule.deleteMany({ where: { key: { in: ["min_interest_rate", "max_interest_rate"] } } });

  const rules = await prisma.loanRule.findMany({ orderBy: { key: "asc" } });
  console.table(rules.map((r) => ({ key: r.key, value: r.value })));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

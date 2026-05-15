import { prisma } from "../src/lib/db";

async function main() {
  const admins = await prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.table(admins);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

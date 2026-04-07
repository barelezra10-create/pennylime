import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const DEFAULT_STEPS = [
  { id: "step-amount", title: "Loan Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-info", title: "Your Info", description: "Tell us about yourself", order: 1, enabled: true, type: "builtin", builtinKey: "info" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 2, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-identity", title: "Identity", description: "Upload your photo ID", order: 3, enabled: true, type: "builtin", builtinKey: "identity" },
  { id: "step-bank", title: "Bank Link", description: "Connect your bank account", order: 4, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-documents", title: "Documents", description: "Upload supporting documents", order: 5, enabled: true, type: "builtin", builtinKey: "documents" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 6, enabled: true, type: "builtin", builtinKey: "review" },
];

async function main() {
  console.log("Seeding form templates...");

  const existing = await prisma.formTemplate.findFirst({ where: { slug: "default" } });
  if (existing && process.env.SEED_FORCE !== "true") {
    console.log("Default form template already exists. Skipping.");
    await prisma.$disconnect();
    return;
  }

  if (existing) {
    await prisma.formTemplate.delete({ where: { id: existing.id } });
  }

  await prisma.formTemplate.create({
    data: {
      name: "Default Application",
      slug: "default",
      description: "The standard 7-step loan application form",
      steps: JSON.stringify(DEFAULT_STEPS),
      isDefault: true,
      published: true,
    },
  });

  // Also create an Uber/Lyft short form (skips platforms step since we know)
  const uberSteps = DEFAULT_STEPS.map((s) => ({
    ...s,
    enabled: s.builtinKey !== "platforms", // skip platforms for Uber/Lyft specific LP
  }));

  const existingUber = await prisma.formTemplate.findFirst({ where: { slug: "uber-lyft-short" } });
  if (!existingUber) {
    await prisma.formTemplate.create({
      data: {
        name: "Uber/Lyft Short Form",
        slug: "uber-lyft-short",
        description: "Shorter form for Uber/Lyft drivers (skips platform selection)",
        steps: JSON.stringify(uberSteps),
        isDefault: false,
        published: true,
      },
    });
  }

  console.log("Form templates seeded.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

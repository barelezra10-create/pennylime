import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });

type TopicCategory = "intro";

// Intro / "who we are" topics — designed to publish FIRST.
// The LRU picker orders by [lastUsedAt asc nulls first, useCount asc].
// These are inserted with lastUsedAt=null + useCount=0, so they're picked
// before any of the 50 educational topics that have already been used.
const INTRO_TOPICS: Array<{ topic: string; category: TopicCategory }> = [
  { topic: "Meet PennyLime: cash advances built for drivers, sellers, and operators", category: "intro" },
  { topic: "Why we built PennyLime: the banking system never adapted to gig income, so we did", category: "intro" },
  { topic: "How PennyLime is different: we read 90 days of bank deposits the way banks used to read a pay stub", category: "intro" },
  { topic: "What PennyLime funds: $500-$10,000 for the work you already do (driving, delivering, selling, operating)", category: "intro" },
  { topic: "Plain English pricing: factor rate, total cost, daily remittance, all spelled out before you tap accept", category: "intro" },
  { topic: "Repayment that moves with you: a percentage of your future earnings, not a fixed monthly bill", category: "intro" },
  { topic: "48 hours from application to funded: no faxed pay stubs, no W-2 required, just verified deposits", category: "intro" },
];

async function main() {
  let inserted = 0;
  for (const t of INTRO_TOPICS) {
    const exists = await prisma.topicPool.findFirst({ where: { topic: t.topic } });
    if (exists) continue;
    await prisma.topicPool.create({
      data: {
        topic: t.topic,
        category: t.category,
        // explicit nulls/zeros so the LRU picker grabs these first
        lastUsedAt: null,
        useCount: 0,
        active: true,
      },
    });
    inserted++;
  }
  console.log(`Seeded ${inserted} intro topics (${INTRO_TOPICS.length - inserted} already existed)`);
  console.log("These will publish FIRST on the next ${INTRO_TOPICS.length} cron runs.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

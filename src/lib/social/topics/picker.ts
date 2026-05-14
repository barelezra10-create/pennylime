import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

export interface PickedTopic {
  id: string;
  topic: string;
  category: string;
}

export async function pickNextTopic(): Promise<PickedTopic | null> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL required for pickNextTopic");
  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
  try {
    // Prefer never-used (lastUsedAt is null) then least-recently-used.
    // Within ties, lowest useCount wins.
    const topic = await prisma.topicPool.findFirst({
      where: { active: true },
      orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { useCount: "asc" }],
    });
    if (!topic) return null;
    await prisma.topicPool.update({
      where: { id: topic.id },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
    return { id: topic.id, topic: topic.topic, category: topic.category };
  } finally {
    await prisma.$disconnect();
  }
}

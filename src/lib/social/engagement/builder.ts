import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

const HASHTAGS_PER_PLATFORM: Record<string, ReadonlyArray<string>> = {
  instagram: ["uberdriver", "doordash", "gigeconomy", "1099life", "rideshare", "instacartshopper", "lyftdriver"],
  facebook: ["uberdriver", "doordash", "gigworkers"],
  linkedin: ["gigeconomy", "fintech", "consumerlending", "futureofwork"],
  tiktok: ["uberdriver", "doordasher", "gigworker", "sidehustle"],
};

const DAILY_CAPS_PER_PLATFORM: Record<string, { likes: number; follows: number }> = {
  instagram: { likes: 25, follows: 7 },
  facebook:  { likes: 25, follows: 0 },
  linkedin:  { likes: 20, follows: 0 },
  tiktok:    { likes: 30, follows: 8 },
};

const RESOLVE_AT_RUNTIME = "__resolve_at_runtime__";

export interface BuildResult {
  inserted: number;
  byPlatform: Record<string, number>;
}

export async function buildEngagementQueue(): Promise<BuildResult> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL required for buildEngagementQueue");
  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
  let inserted = 0;
  const byPlatform: Record<string, number> = {};

  try {
    for (const [platform, hashtags] of Object.entries(HASHTAGS_PER_PLATFORM)) {
      const caps = DAILY_CAPS_PER_PLATFORM[platform];
      if (!caps) continue;
      let count = 0;

      for (let i = 0; i < caps.likes; i++) {
        const hashtag = hashtags[i % hashtags.length];
        await prisma.engagementTarget.create({
          data: {
            platform,
            source: `hashtag:#${hashtag}`,
            targetHandle: RESOLVE_AT_RUNTIME,
            action: "like",
            status: "queued",
          },
        });
        inserted++;
        count++;
      }

      for (let i = 0; i < caps.follows; i++) {
        const hashtag = hashtags[i % hashtags.length];
        await prisma.engagementTarget.create({
          data: {
            platform,
            source: `hashtag:#${hashtag}`,
            targetHandle: RESOLVE_AT_RUNTIME,
            action: "follow",
            status: "queued",
          },
        });
        inserted++;
        count++;
      }

      byPlatform[platform] = count;
    }
  } finally {
    await prisma.$disconnect();
  }

  return { inserted, byPlatform };
}

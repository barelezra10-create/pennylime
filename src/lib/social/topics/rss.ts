import "server-only";
import Parser from "rss-parser";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
// Note: NOT throwing at module load on DATABASE_URL because this module is imported
// by cron routes; we want failure to surface at call time with better context, not
// at the next route-builder import.

const parser = new Parser({ timeout: 15000 });

const FEEDS: ReadonlyArray<string> = [
  "https://therideshareguy.com/feed/",
  "https://gridwise.io/blog/feed/",
  "https://www.bls.gov/feed/news_release.rss",
  "https://www.reddit.com/r/uberdrivers/top.rss?t=week",
];

export interface RssPollResult {
  inserted: number;
  total: number;
  feedErrors: Array<{ url: string; error: string }>;
}

export async function pollRssFeeds(): Promise<RssPollResult> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL required for pollRssFeeds");
  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
  let inserted = 0;
  let total = 0;
  const feedErrors: Array<{ url: string; error: string }> = [];

  try {
    for (const url of FEEDS) {
      try {
        const feed = await parser.parseURL(url);
        for (const item of (feed.items ?? []).slice(0, 10)) {
          total++;
          const topic = item.title?.trim();
          if (!topic) continue;
          const exists = await prisma.topicPool.findFirst({ where: { topic } });
          if (exists) continue;
          await prisma.topicPool.create({
            data: { topic, category: "news" },
          });
          inserted++;
        }
      } catch (err) {
        feedErrors.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return { inserted, total, feedErrors };
}

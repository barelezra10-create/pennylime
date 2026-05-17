import { NextRequest, NextResponse } from "next/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyCronSecret } from "@/lib/cron-auth";
import type { Platform } from "@/lib/social/types";
import { pickNextTopic } from "@/lib/social/topics/picker";
import { generatePostText } from "@/lib/social/generator/text";
import { generatePostImage } from "@/lib/social/generator/image";
import { checkBlocklist } from "@/lib/social/blocklist";
import { publish } from "@/lib/social/publishers";

export const dynamic = "force-dynamic";

const PLATFORMS: ReadonlyArray<Platform> = ["instagram", "facebook", "linkedin", "tiktok"];

interface PlatformSummary {
  platform: Platform;
  status: "no_account" | "no_topic" | "generation_failed" | "blocked" | "published" | "failed";
  postId?: string;
  platformPostId?: string;
  topic?: string;
  error?: string;
  matches?: string[];
}

export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
  const summary: PlatformSummary[] = [];

  try {
    // TODO: add same-day idempotency guard before exposing a manual trigger
    // (currently safe because Railway cron doesn't fire twice simultaneously)
    for (const platform of PLATFORMS) {
      try {
        summary.push(await runPlatform(prisma, platform));
      } catch (err) {
        summary.push({
          platform,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("[social-generate]", JSON.stringify(summary));
  return NextResponse.json({ summary });
}

async function runPlatform(prisma: PrismaClient, platform: Platform): Promise<PlatformSummary> {
  // 1. Look up the account
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform, handle: "@pennylime" } },
  });
  if (!account || !account.accessToken) {
    return { platform, status: "no_account" };
  }

  // 2. Look for a pre-planned post for today (calendar mode). If found,
  //    skip topic-pick + generation and just publish the already-stored
  //    text+image. Falls through to fresh generation if no plan exists.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const planned = await prisma.socialPost.findFirst({
    where: {
      accountId: account.id,
      status: "planned",
      scheduledFor: { gte: todayStart, lt: todayEnd },
    },
    orderBy: { scheduledFor: "asc" },
  });

  if (planned && planned.body && planned.imageUrl) {
    // Publish the pre-planned post
    try {
      const { platformPostId } = await publish({
        platform,
        encryptedAccessToken: account.accessToken,
        platformAccountId: account.platformAccountId ?? "",
        imageUrl: planned.imageUrl,
        body: planned.body,
      });
      await prisma.socialPost.update({
        where: { id: planned.id },
        data: { status: "published", platformPostId, publishedAt: new Date() },
      });
      return {
        platform,
        status: "published",
        postId: planned.id,
        platformPostId,
        topic: planned.topic,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.socialPost.update({
        where: { id: planned.id },
        data: { status: "failed", publishError: errMsg },
      });
      return { platform, status: "failed", postId: planned.id, topic: planned.topic, error: errMsg };
    }
  }

  // 3. No plan — fresh generation path (original behavior)
  const topic = await pickNextTopic();
  if (!topic) {
    return { platform, status: "no_topic" };
  }

  let body: string;
  let imageUrl: string;
  try {
    [body, imageUrl] = await Promise.all([
      generatePostText(topic.topic, platform),
      generatePostImage(topic.topic, platform),
    ]);
  } catch (err) {
    return {
      platform,
      status: "generation_failed",
      topic: topic.topic,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const block = checkBlocklist(body);
  if (!block.passed) {
    const post = await prisma.socialPost.create({
      data: {
        accountId: account.id,
        topic: topic.topic,
        body,
        imageUrl,
        scheduledFor: new Date(),
        status: "blocked",
        publishError: `blocklist: ${block.matches.join(", ")}`,
      },
    });
    return { platform, status: "blocked", postId: post.id, topic: topic.topic, matches: block.matches };
  }

  const post = await prisma.socialPost.create({
    data: {
      accountId: account.id,
      topic: topic.topic,
      body,
      imageUrl,
      scheduledFor: new Date(),
      status: "pending",
    },
  });

  try {
    const { platformPostId } = await publish({
      platform,
      encryptedAccessToken: account.accessToken,
      platformAccountId: account.platformAccountId ?? "",
      imageUrl,
      body,
    });
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "published", platformPostId, publishedAt: new Date() },
    });
    return { platform, status: "published", postId: post.id, platformPostId, topic: topic.topic };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "failed", publishError: errMsg },
    });
    return { platform, status: "failed", postId: post.id, topic: topic.topic, error: errMsg };
  }
}

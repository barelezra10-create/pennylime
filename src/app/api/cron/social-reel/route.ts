import { NextRequest, NextResponse } from "next/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyCronSecret } from "@/lib/cron-auth";
import { pickNextTopic } from "@/lib/social/topics/picker";
import { generatePostText } from "@/lib/social/generator/text";
import { generatePostVideo } from "@/lib/social/generator/video";
import { checkBlocklist } from "@/lib/social/blocklist";
import { publishToInstagramReels } from "@/lib/social/publishers/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // Veo can take 5 min, IG container another 3 min

export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });

  try {
    // Only IG has Reels publishing wired up for v1
    const account = await prisma.socialAccount.findUnique({
      where: { platform_handle: { platform: "instagram", handle: "@pennylime" } },
    });
    if (!account || !account.accessToken) {
      return NextResponse.json({ status: "no_account" });
    }

    // Prefer a pre-planned reel for today (from the calendar). If found,
    // skip generation and just publish.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
    const plannedReel = await prisma.socialPost.findFirst({
      where: {
        accountId: account.id,
        status: "planned",
        scheduledFor: { gte: todayStart, lt: todayEnd },
        imageUrl: { endsWith: ".mp4" },
      },
      orderBy: { scheduledFor: "asc" },
    });
    if (plannedReel && plannedReel.body && plannedReel.imageUrl) {
      try {
        const { platformPostId } = await publishToInstagramReels(
          account.accessToken,
          account.platformAccountId ?? "",
          plannedReel.imageUrl,
          plannedReel.body,
        );
        await prisma.socialPost.update({
          where: { id: plannedReel.id },
          data: { status: "published", platformPostId, publishedAt: new Date() },
        });
        console.log("[social-reel] published planned", platformPostId);
        return NextResponse.json({
          status: "published",
          source: "planned",
          postId: plannedReel.id,
          platformPostId,
          topic: plannedReel.topic,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await prisma.socialPost.update({
          where: { id: plannedReel.id },
          data: { status: "failed", publishError: errMsg },
        });
        return NextResponse.json({
          status: "failed",
          source: "planned",
          postId: plannedReel.id,
          error: errMsg,
        });
      }
    }

    // Fallback: no planned reel today, generate fresh
    const topic = await pickNextTopic();
    if (!topic) return NextResponse.json({ status: "no_topic" });

    // Generate caption + video in parallel (caption is fast, video is slow)
    let body: string;
    let videoUrl: string;
    try {
      [body, videoUrl] = await Promise.all([
        generatePostText(topic.topic, "instagram"),
        generatePostVideo(topic.topic, "instagram"),
      ]);
    } catch (err) {
      return NextResponse.json({
        status: "generation_failed",
        topic: topic.topic,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const block = checkBlocklist(body);
    if (!block.passed) {
      const post = await prisma.socialPost.create({
        data: {
          accountId: account.id,
          topic: topic.topic,
          body,
          imageUrl: videoUrl, // reuses imageUrl column for media URL
          scheduledFor: new Date(),
          status: "blocked",
          publishError: `blocklist: ${block.matches.join(", ")}`,
        },
      });
      return NextResponse.json({
        status: "blocked",
        postId: post.id,
        topic: topic.topic,
        matches: block.matches,
      });
    }

    const post = await prisma.socialPost.create({
      data: {
        accountId: account.id,
        topic: topic.topic,
        body,
        imageUrl: videoUrl,
        scheduledFor: new Date(),
        status: "pending",
      },
    });

    try {
      const { platformPostId } = await publishToInstagramReels(
        account.accessToken,
        account.platformAccountId ?? "",
        videoUrl,
        body,
      );
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "published", platformPostId, publishedAt: new Date() },
      });
      console.log("[social-reel] published", platformPostId);
      return NextResponse.json({
        status: "published",
        postId: post.id,
        platformPostId,
        topic: topic.topic,
        videoUrl,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "failed", publishError: errMsg },
      });
      console.error("[social-reel] failed", errMsg);
      return NextResponse.json({
        status: "failed",
        postId: post.id,
        topic: topic.topic,
        error: errMsg,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

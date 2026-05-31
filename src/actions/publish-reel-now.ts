"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pickNextTopic } from "@/lib/social/topics/picker";
import { generatePostText } from "@/lib/social/generator/text";
import { generatePostVideo } from "@/lib/social/generator/video";
import { checkBlocklist } from "@/lib/social/blocklist";
import { publishToInstagramReels } from "@/lib/social/publishers/meta";
import { logAudit } from "@/lib/audit";

/**
 * Admin-triggered "publish a reel right now" - same logic as the
 * social-reel cron but runnable from the admin UI without the cron
 * secret. Generates a fresh topic + Veo video + caption, then publishes
 * to Instagram Reels.
 *
 * Long-running: Veo takes 3-5 minutes, IG container takes 1-3 minutes.
 * Returns when the post is either published or has failed.
 */
export async function publishReelNow(): Promise<
  | { ok: true; postId: string; platformPostId: string; topic: string; videoUrl: string }
  | { ok: false; error: string; postId?: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform: "instagram", handle: "@pennylime" } },
  });
  if (!account || !account.accessToken) {
    return { ok: false, error: "No Instagram account configured (or missing access token)" };
  }

  const topic = await pickNextTopic();
  if (!topic) return { ok: false, error: "No topics available to generate" };

  let body: string;
  let videoUrl: string;
  try {
    [body, videoUrl] = await Promise.all([
      generatePostText(topic.topic, "instagram"),
      generatePostVideo(topic.topic, "instagram"),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const block = checkBlocklist(body);
  if (!block.passed) {
    const post = await prisma.socialPost.create({
      data: {
        accountId: account.id,
        topic: topic.topic,
        body,
        imageUrl: videoUrl,
        scheduledFor: new Date(),
        status: "blocked",
        publishError: `blocklist: ${block.matches.join(", ")}`,
      },
    });
    return {
      ok: false,
      error: `Caption blocked by safety filter: ${block.matches.join(", ")}`,
      postId: post.id,
    };
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
    await logAudit({
      action: "CHANGE_SETTING",
      entityType: "ADMIN_USER",
      entityId: post.id,
      performedBy: session.user.email,
      details: {
        kind: "MANUAL_REEL_PUBLISHED",
        topic: topic.topic,
        platformPostId,
        videoUrl,
      },
    });
    return { ok: true, postId: post.id, platformPostId, topic: topic.topic, videoUrl };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "failed", publishError: errMsg },
    });
    return { ok: false, error: `Publish to Instagram failed: ${errMsg}`, postId: post.id };
  }
}

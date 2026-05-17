import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "./types";
import { pickNextTopic } from "./topics/picker";
import { generatePostText } from "./generator/text";
import { generatePostImage } from "./generator/image";
import { checkBlocklist } from "./blocklist";

type Status = "planned" | "blocked" | "failed";

interface GenerateResult {
  postId: string;
  status: Status;
  topic: string;
  body?: string;
  imageUrl?: string;
  matches?: string[];
  error?: string;
}

/**
 * Pick a topic, generate text + image in parallel, blocklist-check,
 * persist a SocialPost row tagged with the target scheduledFor.
 * Does NOT publish — that's the cron's job at publish time.
 *
 * Used by:
 *   - month planner (pre-populates a calendar of planned posts)
 *   - regenerate action (replaces an existing post's content)
 */
export async function generateAndStorePlanned(
  platform: Platform,
  accountId: string,
  scheduledFor: Date,
): Promise<GenerateResult> {
  const topic = await pickNextTopic();
  if (!topic) {
    throw new Error("No active topics in pool");
  }

  let body: string;
  let imageUrl: string;
  try {
    [body, imageUrl] = await Promise.all([
      generatePostText(topic.topic, platform),
      generatePostImage(topic.topic, platform),
    ]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const post = await prisma.socialPost.create({
      data: {
        accountId,
        topic: topic.topic,
        body: "",
        scheduledFor,
        status: "failed",
        publishError: `generation: ${errMsg}`,
      },
    });
    return { postId: post.id, status: "failed", topic: topic.topic, error: errMsg };
  }

  const block = checkBlocklist(body);
  if (!block.passed) {
    const post = await prisma.socialPost.create({
      data: {
        accountId,
        topic: topic.topic,
        body,
        imageUrl,
        scheduledFor,
        status: "blocked",
        publishError: `blocklist: ${block.matches.join(", ")}`,
      },
    });
    return {
      postId: post.id,
      status: "blocked",
      topic: topic.topic,
      body,
      imageUrl,
      matches: block.matches,
    };
  }

  const post = await prisma.socialPost.create({
    data: {
      accountId,
      topic: topic.topic,
      body,
      imageUrl,
      scheduledFor,
      status: "planned",
    },
  });
  return { postId: post.id, status: "planned", topic: topic.topic, body, imageUrl };
}

/**
 * Replace an existing SocialPost's content with freshly generated text + image.
 * Used by the calendar "regenerate" button.
 * Only works on planned/blocked/failed posts — refuses published ones.
 */
export async function regeneratePlanned(postId: string): Promise<GenerateResult> {
  const existing = await prisma.socialPost.findUnique({
    where: { id: postId },
    include: { account: true },
  });
  if (!existing) throw new Error(`SocialPost ${postId} not found`);
  if (existing.status === "published") {
    throw new Error(`SocialPost ${postId} already published — can't regenerate`);
  }

  const platform = existing.account.platform as Platform;

  // Re-pick a fresh topic rather than reusing the old one — Bar's
  // intent is "I don't like this one, give me something else"
  const topic = await pickNextTopic();
  if (!topic) throw new Error("No active topics in pool");

  let body: string;
  let imageUrl: string;
  try {
    [body, imageUrl] = await Promise.all([
      generatePostText(topic.topic, platform),
      generatePostImage(topic.topic, platform),
    ]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        topic: topic.topic,
        body: "",
        imageUrl: null,
        status: "failed",
        publishError: `regeneration: ${errMsg}`,
      },
    });
    return { postId, status: "failed", topic: topic.topic, error: errMsg };
  }

  const block = checkBlocklist(body);
  const status: Status = block.passed ? "planned" : "blocked";
  await prisma.socialPost.update({
    where: { id: postId },
    data: {
      topic: topic.topic,
      body,
      imageUrl,
      status,
      publishError: block.passed ? null : `blocklist: ${block.matches.join(", ")}`,
    },
  });
  return {
    postId,
    status,
    topic: topic.topic,
    body,
    imageUrl,
    matches: block.passed ? undefined : block.matches,
  };
}

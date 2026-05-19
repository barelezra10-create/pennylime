import "server-only";
import { prisma } from "@/lib/db";
import { decryptToken } from "../crypto";
import { isQuestion } from "./is-question";

// Look back ~14 days for recent posts to scan for comments
const POSTS_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
// Don't reply to comments older than 48h (avoid resurrecting dead threads)
const REPLY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

interface PolledComment {
  id: string;
  text: string;
  username?: string;
  fromUserId?: string;
  timestamp: Date;
  parentPostId: string;
}

/**
 * Pull comments for all recently-published posts on a platform.
 * Inserts new SocialComment rows into the DB (idempotent on platformCommentId).
 * Classifies each as question or not; sets status='new' for questions,
 * status='skipped' for non-questions.
 */
export async function pollComments(platform: "instagram" | "facebook"): Promise<{
  postsScanned: number;
  newComments: number;
  newQuestions: number;
  errors: string[];
}> {
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform, handle: "@pennylime" } },
  });
  if (!account || !account.accessToken) {
    return { postsScanned: 0, newComments: 0, newQuestions: 0, errors: ["no_account"] };
  }
  const token = decryptToken(account.accessToken);

  // Get our recently-published posts on this platform from our DB.
  const since = new Date(Date.now() - POSTS_LOOKBACK_MS);
  const posts = await prisma.socialPost.findMany({
    where: {
      accountId: account.id,
      status: "published",
      publishedAt: { gte: since },
      platformPostId: { not: null },
    },
    select: { id: true, platformPostId: true },
  });

  let newComments = 0;
  let newQuestions = 0;
  const errors: string[] = [];

  for (const post of posts) {
    if (!post.platformPostId) continue;
    try {
      const comments = await fetchCommentsFor(platform, post.platformPostId, token);
      for (const c of comments) {
        // Idempotency: skip if we already have this comment
        const existing = await prisma.socialComment.findUnique({
          where: { platformCommentId: c.id },
        });
        if (existing) continue;

        const tooOld = Date.now() - c.timestamp.getTime() > REPLY_MAX_AGE_MS;
        const isQ = isQuestion(c.text);
        // Skip our own comments (the page replying to itself)
        const isSelf = c.username === "pennylime" || c.username === "pennylime10";
        const status = isSelf || !isQ || tooOld ? "skipped" : "new";

        await prisma.socialComment.create({
          data: {
            platform,
            socialPostId: post.id,
            platformPostId: post.platformPostId,
            platformCommentId: c.id,
            fromUsername: c.username ?? null,
            fromUserId: c.fromUserId ?? null,
            text: c.text,
            isQuestion: isQ,
            status,
            commentedAt: c.timestamp,
          },
        });
        newComments++;
        if (status === "new") newQuestions++;
      }
    } catch (err) {
      errors.push(
        `${post.platformPostId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { postsScanned: posts.length, newComments, newQuestions, errors };
}

async function fetchCommentsFor(
  platform: "instagram" | "facebook",
  platformPostId: string,
  token: string,
): Promise<PolledComment[]> {
  if (platform === "instagram") {
    // IG: /{ig-media-id}/comments?fields=id,text,username,timestamp,from
    const url = `https://graph.facebook.com/v22.0/${platformPostId}/comments?fields=id,text,username,timestamp,from&limit=50&access_token=${token}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Array<{ id: string; text?: string; username?: string; timestamp: string; from?: { id: string } }>;
      error?: { message: string };
    };
    if (json.error) throw new Error(`IG comments fetch: ${json.error.message}`);
    return (json.data ?? []).map((c) => ({
      id: c.id,
      text: c.text ?? "",
      username: c.username,
      fromUserId: c.from?.id,
      timestamp: new Date(c.timestamp),
      parentPostId: platformPostId,
    }));
  }
  // Facebook: /{page-post-id}/comments
  const url = `https://graph.facebook.com/v22.0/${platformPostId}/comments?fields=id,message,from,created_time&limit=50&access_token=${token}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: Array<{ id: string; message?: string; from?: { id: string; name?: string }; created_time: string }>;
    error?: { message: string };
  };
  if (json.error) throw new Error(`FB comments fetch: ${json.error.message}`);
  return (json.data ?? []).map((c) => ({
    id: c.id,
    text: c.message ?? "",
    username: c.from?.name,
    fromUserId: c.from?.id,
    timestamp: new Date(c.created_time),
    parentPostId: platformPostId,
  }));
}

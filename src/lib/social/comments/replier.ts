import "server-only";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { decryptToken } from "../crypto";
import { checkBlocklist } from "../blocklist";
import { withRetry } from "../generator/retry";

const GEMINI_MODEL = "gemini-2.5-flash";
const REPLY_DAILY_CAP = 20; // total replies/day across all platforms (safety)

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY required");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

const SYSTEM_PROMPT = `You are PennyLime's social media voice replying to a comment on one of our posts. PennyLime is a cash advance product for gig-economy workers (Uber, Lyft, DoorDash, Instacart, etc.).

RULES:
- Reply is 1-2 short sentences, max 240 characters.
- Direct, warm, human. NOT corporate. NOT salesy.
- Plain English. Answer the question honestly.
- NEVER use: guaranteed, instant approval, no credit check, no fees, "approved in seconds", APR claims, specific dollar promises in the headline.
- NEVER use em dashes or long dashes.
- DON'T pitch the product if the question is conversational. ONLY mention pennylime.com/apply if the question is specifically about getting funded.
- DON'T sign off with "PennyLime Team" or similar. Just the reply text.
- If the question is hostile / spam / off-topic, reply with a brief polite redirect (or output exactly the single word: SKIP).`;

interface ReplyResult {
  posted: number;
  skipped: number;
  failed: number;
  details: Array<{ commentId: string; result: string }>;
}

export async function replyToQuestions(
  platform: "instagram" | "facebook",
): Promise<ReplyResult> {
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform, handle: "@pennylime" } },
  });
  if (!account || !account.accessToken) {
    return { posted: 0, skipped: 0, failed: 0, details: [{ commentId: "*", result: "no_account" }] };
  }
  const token = decryptToken(account.accessToken);

  // Daily cap across BOTH platforms
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const repliedToday = await prisma.socialComment.count({
    where: { status: "replied", repliedAt: { gte: todayStart } },
  });
  if (repliedToday >= REPLY_DAILY_CAP) {
    return {
      posted: 0, skipped: 0, failed: 0,
      details: [{ commentId: "*", result: `daily-cap (${REPLY_DAILY_CAP}) reached` }],
    };
  }

  const remaining = REPLY_DAILY_CAP - repliedToday;
  // Process oldest "new" (question) comments first
  const todo = await prisma.socialComment.findMany({
    where: { platform, status: "new", isQuestion: true },
    orderBy: { commentedAt: "asc" },
    take: remaining,
  });

  const out: ReplyResult = { posted: 0, skipped: 0, failed: 0, details: [] };
  const client = getClient();

  for (const c of todo) {
    try {
      // 1. Generate reply via Gemini
      const prompt = `${SYSTEM_PROMPT}\n\nCOMMENT FROM ${c.fromUsername ?? "someone"}:\n${c.text}\n\nReply:`;
      const resp = await withRetry(
        () => client.models.generateContent({ model: GEMINI_MODEL, contents: prompt }),
        { label: `comment-reply [${platform}]` },
      );
      const raw = (resp.text ?? "").trim();
      const cleaned = raw
        .replace(/^["']+|["']+$/g, "")
        .replaceAll("—", ",").replaceAll("–", "-")
        .trim();

      if (!cleaned || cleaned.toUpperCase() === "SKIP") {
        await prisma.socialComment.update({
          where: { id: c.id },
          data: { status: "skipped", replyError: "ai_skip" },
        });
        out.skipped++;
        out.details.push({ commentId: c.platformCommentId, result: "ai_skip" });
        continue;
      }
      // 2. Blocklist guard
      const block = checkBlocklist(cleaned);
      if (!block.passed) {
        await prisma.socialComment.update({
          where: { id: c.id },
          data: {
            status: "blocked",
            replyText: cleaned,
            replyError: `blocklist: ${block.matches.join(", ")}`,
          },
        });
        out.failed++;
        out.details.push({ commentId: c.platformCommentId, result: `blocked: ${block.matches}` });
        continue;
      }

      // 3. Post the reply via Graph API
      try {
        const platformReplyId = await postReply(platform, c.platformCommentId, cleaned, token);
        await prisma.socialComment.update({
          where: { id: c.id },
          data: {
            status: "replied",
            replyText: cleaned,
            replyCommentId: platformReplyId,
            repliedAt: new Date(),
          },
        });
        out.posted++;
        out.details.push({ commentId: c.platformCommentId, result: `posted as ${platformReplyId}` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.socialComment.update({
          where: { id: c.id },
          data: { status: "failed", replyText: cleaned, replyError: msg },
        });
        out.failed++;
        out.details.push({ commentId: c.platformCommentId, result: `post_failed: ${msg.slice(0, 100)}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.socialComment.update({
        where: { id: c.id },
        data: { status: "failed", replyError: `gen: ${msg}` },
      });
      out.failed++;
      out.details.push({ commentId: c.platformCommentId, result: `gen_failed: ${msg.slice(0, 100)}` });
    }
  }
  return out;
}

async function postReply(
  platform: "instagram" | "facebook",
  parentCommentId: string,
  text: string,
  token: string,
): Promise<string> {
  if (platform === "instagram") {
    // IG: POST /{comment-id}/replies?message=...
    const url = `https://graph.facebook.com/v22.0/${parentCommentId}/replies?message=${encodeURIComponent(text)}&access_token=${token}`;
    const res = await fetch(url, { method: "POST" });
    const json = (await res.json()) as { id?: string; error?: { message: string } };
    if (json.error || !json.id) throw new Error(`IG reply failed: ${json.error?.message || "no id"}`);
    return json.id;
  }
  // FB: POST /{comment-id}/comments?message=...
  const url = `https://graph.facebook.com/v22.0/${parentCommentId}/comments?message=${encodeURIComponent(text)}&access_token=${token}`;
  const res = await fetch(url, { method: "POST" });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (json.error || !json.id) throw new Error(`FB reply failed: ${json.error?.message || "no id"}`);
  return json.id;
}

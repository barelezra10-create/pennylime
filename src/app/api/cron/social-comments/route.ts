import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { pollComments } from "@/lib/social/comments/poller";
import { replyToQuestions } from "@/lib/social/comments/replier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every 15 min. For each platform: pull fresh comments on our
 * recent posts, classify each as question/not, then generate + post
 * replies to the questions only. Daily reply cap = 20 globally.
 */
export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const result: Record<string, unknown> = {};
  for (const platform of ["instagram", "facebook"] as const) {
    try {
      const polled = await pollComments(platform);
      const replied = await replyToQuestions(platform);
      result[platform] = { polled, replied };
    } catch (err) {
      result[platform] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  console.log("[social-comments]", JSON.stringify(result));
  return NextResponse.json(result);
}

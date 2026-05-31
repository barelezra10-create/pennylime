import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { planMonth } from "@/lib/social/planner";
import type { Platform } from "@/lib/social/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Fires monthly (Railway cron suggestion: `0 14 25 * *` — 25th of each month
 * at 14:00 UTC). Pre-plans the FOLLOWING month for every platform that has
 * a token pasted. Re-runs are safe — planMonth skips days that already have
 * a SocialPost.
 */
export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  // Target = next calendar month (UTC)
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;

  const accounts = await prisma.socialAccount.findMany({
    where: { accessToken: { not: "" } },
  });

  const results: Record<string, unknown> = {};
  for (const a of accounts) {
    try {
      // Two passes per account: images own Tue/Thu/Sat/Sun, reels own
      // Mon/Wed/Fri. Without the reel pass, MWF was being filled with
      // still images - the bug Bar saw in the calendar ("in reel day it
      // uploaded a picture"). Reels only post to Instagram for now since
      // that's the only platform with Reels publishing wired up.
      const img = await planMonth(a.platform as Platform, year, month, undefined, "image");
      const reel =
        a.platform === "instagram"
          ? await planMonth(a.platform as Platform, year, month, undefined, "reel")
          : null;
      results[a.platform] = {
        image: { planned: img.planned, skipped: img.skipped, failed: img.failed },
        reel: reel
          ? { planned: reel.planned, skipped: reel.skipped, failed: reel.failed }
          : "not_supported",
      };
    } catch (err) {
      results[a.platform] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  console.log("[social-plan-next-month]", year, month, JSON.stringify(results));
  return NextResponse.json({ year, month, results });
}

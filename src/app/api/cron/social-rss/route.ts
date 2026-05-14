import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { pollRssFeeds } from "@/lib/social/topics/rss";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const result = await pollRssFeeds();
  return NextResponse.json(result);
}

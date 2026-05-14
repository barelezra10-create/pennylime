import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { buildEngagementQueue } from "@/lib/social/engagement/builder";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const result = await buildEngagementQueue();
  return NextResponse.json(result);
}

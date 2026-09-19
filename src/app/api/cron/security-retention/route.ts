import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runRetentionReview } from "@/lib/security/retention";
export async function POST(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;
  return NextResponse.json(await runRetentionReview());
}

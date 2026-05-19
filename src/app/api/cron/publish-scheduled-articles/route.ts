import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { publishScheduledArticles } from "@/lib/seo-calendar";

/**
 * Daily cron — call from cron-job.org with the CRON_SECRET header.
 *
 * For any Article whose scheduledFor <= now AND published=false:
 *   - If contentGenerated=false, generate the body via Gemini first
 *   - Then flip published=true + publishedAt=now
 *
 * Idempotent. If the AI generation fails for any article it stays
 * unpublished and is retried on the next run.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const result = await publishScheduledArticles();
  return NextResponse.json({ ok: true, ...result });
}

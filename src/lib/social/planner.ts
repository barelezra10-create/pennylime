import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "./types";
import { generateAndStorePlanned, type MediaType } from "./generate-and-store";

// Reels post Mon/Wed/Fri only (UTC dayOfWeek 1, 3, 5).
const REEL_DAYS = new Set([1, 3, 5]);

// Sleep between Imagen generations to stay under per-minute quota.
// Imagen 4.0 limit is ~60 requests/min — at 4s per iteration we cap
// ourselves at 15/min, plenty of headroom.
const PLANNER_INTERVAL_MS = 4000;

/**
 * Compute the scheduledFor datetime for a given platform-day.
 * Posts publish at 15:00 UTC (matches the existing social-generate cron).
 */
function publishTimeForDay(year: number, monthZeroIdx: number, day: number): Date {
  return new Date(Date.UTC(year, monthZeroIdx, day, 15, 0, 0));
}

interface PlanResult {
  planned: number;
  skipped: number;
  failed: number;
  details: Array<{ date: string; status: "planned" | "skipped" | "failed"; topic?: string; error?: string }>;
}

/**
 * Generate a SocialPost for every day in the target month for the given
 * platform. Skips days that already have a post (no double-spend).
 *
 * year: full year (e.g., 2026)
 * month: 1-12 (human-friendly)
 * maxDays: optional cap on how many NEW posts to plan in this call.
 *   Useful for chunking so calls finish under Cloudflare's 100s timeout
 *   (planning 1 day takes ~5-9s; 5 days = ~30s fits well).
 */
export async function planMonth(
  platform: Platform,
  year: number,
  month: number,
  maxDays?: number,
  mediaType: MediaType = "image",
): Promise<PlanResult> {
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform, handle: "@pennylime" } },
  });
  if (!account) throw new Error(`No SocialAccount for ${platform}`);

  const monthIdx = month - 1; // JS Date months are 0-indexed
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Find existing posts for this account+month+mediaType so we skip duplicates.
  // We detect mediaType by file extension on imageUrl (.mp4/.mov = reel).
  const monthStart = new Date(Date.UTC(year, monthIdx, 1));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
  const existing = await prisma.socialPost.findMany({
    where: {
      accountId: account.id,
      scheduledFor: { gte: monthStart, lt: monthEnd },
      status: { in: ["planned", "published", "blocked", "pending"] },
    },
    select: { id: true, scheduledFor: true, imageUrl: true },
  });
  const isReelUrl = (u: string | null | undefined): boolean =>
    !!u && /\.(mp4|mov)$/i.test(u);
  const existingDays = new Set(
    existing
      .filter((p) => isReelUrl(p.imageUrl) === (mediaType === "reel"))
      .map((p) => p.scheduledFor.getUTCDate()),
  );

  // Auto-clean failed posts for this account+month+mediaType so we don't
  // accumulate junk. (Failed posts have no imageUrl so we filter by the
  // publishError tag we stamp in generateAndStorePlanned.)
  const failedTagPrefix = mediaType === "reel" ? "reel-generation:" : "image-generation:";
  await prisma.socialPost.deleteMany({
    where: {
      accountId: account.id,
      scheduledFor: { gte: monthStart, lt: monthEnd },
      status: "failed",
      OR: [
        { publishError: { startsWith: failedTagPrefix } },
        // backward compat: pre-mediaType failures used "generation:" prefix
        { publishError: { startsWith: "generation:" } },
      ],
    },
  });

  const result: PlanResult = { planned: 0, skipped: 0, failed: 0, details: [] };

  let first = true;
  let generatedCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const scheduledFor = publishTimeForDay(year, monthIdx, day);
    const dateStr = scheduledFor.toISOString().slice(0, 10);

    // For reels: only schedule on Mon/Wed/Fri (UTC dayOfWeek 1, 3, 5).
    // Other days simply have no reel slot — that's expected, not "skipped."
    if (mediaType === "reel") {
      const dow = scheduledFor.getUTCDay();
      if (!REEL_DAYS.has(dow)) continue;
    }

    if (existingDays.has(day)) {
      result.skipped++;
      result.details.push({ date: dateStr, status: "skipped" });
      continue;
    }

    // Stop if we've hit the chunk cap (lets the caller retry to make progress
    // without hitting Cloudflare's 100s edge timeout).
    if (maxDays !== undefined && generatedCount >= maxDays) {
      break;
    }

    // Pace ourselves: only sleep BEFORE actually generating (skip-days are free).
    if (!first) {
      await new Promise((r) => setTimeout(r, PLANNER_INTERVAL_MS));
    }
    first = false;

    try {
      const r = await generateAndStorePlanned(platform, account.id, scheduledFor, mediaType);
      generatedCount++;
      if (r.status === "planned") {
        result.planned++;
        result.details.push({ date: dateStr, status: "planned", topic: r.topic });
      } else if (r.status === "failed") {
        result.failed++;
        result.details.push({ date: dateStr, status: "failed", error: r.error });
        // Likely quota — back off harder before next attempt
        if (r.error?.includes("429") || r.error?.toLowerCase().includes("quota")) {
          await new Promise((r) => setTimeout(r, 30_000));
        }
      } else {
        // blocked — still count as planned slot (just needs manual review)
        result.planned++;
        result.details.push({ date: dateStr, status: "planned", topic: r.topic + " (BLOCKED)" });
      }
    } catch (err) {
      result.failed++;
      result.details.push({
        date: dateStr,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

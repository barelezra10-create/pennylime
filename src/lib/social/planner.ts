import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "./types";
import { generateAndStorePlanned } from "./generate-and-store";

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
 */
export async function planMonth(
  platform: Platform,
  year: number,
  month: number,
): Promise<PlanResult> {
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform, handle: "@pennylime" } },
  });
  if (!account) throw new Error(`No SocialAccount for ${platform}`);
  // We don't gate on accessToken here — the planner generates content
  // regardless of whether the account is ready to publish. That way Bar
  // can review/regenerate in the calendar before tokens are even pasted.

  const monthIdx = month - 1; // JS Date months are 0-indexed
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Find existing posts for this account in this month so we skip duplicates
  const monthStart = new Date(Date.UTC(year, monthIdx, 1));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
  const existing = await prisma.socialPost.findMany({
    where: {
      accountId: account.id,
      scheduledFor: { gte: monthStart, lt: monthEnd },
    },
    select: { id: true, scheduledFor: true },
  });
  const existingDays = new Set(existing.map((p) => p.scheduledFor.getUTCDate()));

  const result: PlanResult = { planned: 0, skipped: 0, failed: 0, details: [] };

  for (let day = 1; day <= daysInMonth; day++) {
    const scheduledFor = publishTimeForDay(year, monthIdx, day);
    const dateStr = scheduledFor.toISOString().slice(0, 10);

    if (existingDays.has(day)) {
      result.skipped++;
      result.details.push({ date: dateStr, status: "skipped" });
      continue;
    }

    try {
      const r = await generateAndStorePlanned(platform, account.id, scheduledFor);
      if (r.status === "planned") {
        result.planned++;
        result.details.push({ date: dateStr, status: "planned", topic: r.topic });
      } else if (r.status === "failed") {
        result.failed++;
        result.details.push({ date: dateStr, status: "failed", error: r.error });
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

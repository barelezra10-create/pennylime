"use server";
import { revalidatePath } from "next/cache";
import { planMonth } from "@/lib/social/planner";
import { regeneratePlanned } from "@/lib/social/generate-and-store";
import type { Platform } from "@/lib/social/types";

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["instagram", "facebook", "linkedin", "tiktok"];

function assertPlatform(p: string): asserts p is Platform {
  if (!VALID_PLATFORMS.includes(p as Platform)) {
    throw new Error(`invalid platform: ${p}`);
  }
}

// Cap each click at 3 days. With retries adding up to 20s per generation
// on 503s, worst-case 3 * 28s = 84s, fits under Cloudflare's 100s timeout.
// User clicks more times to fill the month but each click reliably succeeds.
const CHUNK_SIZE = 3;

export async function planMonthAction(formData: FormData) {
  const platform = String(formData.get("platform"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  assertPlatform(platform);
  await planMonth(platform, year, month, CHUNK_SIZE);
  revalidatePath(`/admin/social/calendar/${platform}`);
}

export async function regeneratePostAction(formData: FormData) {
  const postId = String(formData.get("postId"));
  const platform = String(formData.get("platform"));
  assertPlatform(platform);
  await regeneratePlanned(postId);
  revalidatePath(`/admin/social/calendar/${platform}`);
}

"use server";
import { revalidatePath } from "next/cache";
import { planMonth } from "@/lib/social/planner";
import { regeneratePlanned } from "@/lib/social/generate-and-store";
import type { MediaType } from "@/lib/social/generate-and-store";
import type { Platform } from "@/lib/social/types";

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["instagram", "facebook", "linkedin", "tiktok"];

function assertPlatform(p: string): asserts p is Platform {
  if (!VALID_PLATFORMS.includes(p as Platform)) {
    throw new Error(`invalid platform: ${p}`);
  }
}

// Image chunk: 3 days × ~25s = 75s, fits under Cloudflare's 100s edge timeout.
// Reel chunk: 2 reels × ~50s = 100s — right at the edge but reels are
// fundamentally slow (Veo takes 30-60s per clip). User clicks more times.
const CHUNK_IMAGE = 3;
const CHUNK_REEL = 2;

export async function planMonthAction(formData: FormData) {
  const platform = String(formData.get("platform"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const mediaType = (String(formData.get("mediaType") ?? "image")) as MediaType;
  assertPlatform(platform);
  const chunk = mediaType === "reel" ? CHUNK_REEL : CHUNK_IMAGE;
  await planMonth(platform, year, month, chunk, mediaType);
  revalidatePath(`/admin/social/calendar/${platform}`);
}

export async function regeneratePostAction(formData: FormData) {
  const postId = String(formData.get("postId"));
  const platform = String(formData.get("platform"));
  assertPlatform(platform);
  await regeneratePlanned(postId);
  revalidatePath(`/admin/social/calendar/${platform}`);
}

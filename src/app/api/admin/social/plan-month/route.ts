import { NextRequest, NextResponse } from "next/server";
import { planMonth } from "@/lib/social/planner";
import type { Platform } from "@/lib/social/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["instagram", "facebook", "linkedin", "tiktok"];

export async function POST(req: NextRequest) {
  let body: { platform?: string; year?: number; month?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { platform, year, month } = body;
  if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ error: "invalid platform" }, { status: 400 });
  }
  if (typeof year !== "number" || typeof month !== "number" || month < 1 || month > 12) {
    return NextResponse.json({ error: "invalid year/month" }, { status: 400 });
  }

  try {
    const result = await planMonth(platform as Platform, year, month);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

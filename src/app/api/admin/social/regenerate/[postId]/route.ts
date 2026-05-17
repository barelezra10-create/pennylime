import { NextRequest, NextResponse } from "next/server";
import { regeneratePlanned } from "@/lib/social/generate-and-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  if (!postId) return NextResponse.json({ error: "missing postId" }, { status: 400 });
  try {
    const result = await regeneratePlanned(postId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

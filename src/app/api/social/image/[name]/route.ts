import { NextRequest, NextResponse } from "next/server";
import { readImage } from "@/lib/social/storage";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const buf = await readImage(name);
  if (!buf) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ext = name.split(".").pop()?.toLowerCase() ?? "png";
  const ct =
    ext === "mp4" ? "video/mp4"
    : ext === "mov" ? "video/quicktime"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : "image/png";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": ct,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

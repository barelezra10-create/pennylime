import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * Alternate public route serving blog hero images. Same backend
 * (files in /app/uploads/blog-images) as /api/blog-images/, but a
 * different URL path. Used to bypass stale 404 caches when the
 * primary route was accidentally serving 404s earlier in the day.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const dir =
    process.env.BLOG_IMAGE_DIR ||
    path.join(process.env.UPLOAD_DIR || "/app/uploads", "blog-images");
  const filePath = path.join(dir, slug);
  const resolved = path.resolve(filePath);
  const root = path.resolve(dir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] || "image/png";
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

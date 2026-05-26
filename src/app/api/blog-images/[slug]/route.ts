import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * Public serving route for AI-generated blog hero images.
 *
 * Why separate from /api/files: that route requires admin auth (it
 * serves bank statements + signed agreement PDFs that mustn't be
 * publicly readable). Blog hero images are the opposite — search
 * engines, social-share crawlers, and anonymous readers all need
 * unauthenticated access.
 *
 * Path: /api/blog-images/{slug}.png → /app/blog-images/{slug}.png
 * Slug is restricted to a safe character set to prevent path traversal.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Defense: only allow alphanumeric, hyphen, underscore, dot.
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Must match the path the generator writes to — under the
  // persistent /app/uploads Railway Volume (NOT /app/blog-images,
  // which is ephemeral and gets wiped on every Railway redeploy).
  const dir =
    process.env.BLOG_IMAGE_DIR ||
    path.join(process.env.UPLOAD_DIR || "/app/uploads", "blog-images");
  const filePath = path.join(dir, slug);
  const resolved = path.resolve(filePath);
  const root = path.resolve(dir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };

  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = mimeTypes[ext] || "image/png";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        // Long cache: the image rarely changes after generation.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch {
    // Image not generated yet — serve the brand hero image so crawlers and
    // social-share previews don't see a 404 (which Ahrefs flags as a broken
    // image on the parent page). 200 + short cache so a regenerated file
    // takes over quickly.
    try {
      const fallback = await fs.readFile(
        path.join(process.cwd(), "public", "hero-rider.jpg"),
      );
      return new NextResponse(fallback, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
}

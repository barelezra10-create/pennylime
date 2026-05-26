import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const segments = (await params).path;
  const filePath = decodeURIComponent(segments.join("/"));

  // Prevent path traversal. path.resolve normalises ../ but doesn't
  // follow symlinks - if anyone manages to plant a symlink in uploadsDir
  // pointing at /etc/passwd, the startsWith check would pass. We resolve
  // realpath as well; if the realpath escapes uploadsDir, reject. We
  // wrap in try/catch because realpath throws on non-existent paths and
  // we want to keep the existing 404 fallback for those.
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const fsModule = await import("fs/promises");
    const realPath = await fsModule.realpath(resolved);
    if (!realPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    // realpath fails if the file doesn't exist - fall through to the
    // existing 404 path. Only blocks confirmed symlink escapes.
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";

  // 1. Exact stored path
  try {
    const file = await fs.readFile(resolved);
    return new NextResponse(file, { headers: { "Content-Type": contentType } });
  } catch {
    // fall through to recovery
  }

  // 2. Recovery: file moved between deploys / volume re-mount / different
  //    UPLOAD_DIR config. Search every date subfolder under the current
  //    uploadsDir for a file matching the original basename.
  const basename = path.basename(resolved);
  try {
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(uploadsDir, entry.name, basename);
      try {
        const file = await fs.readFile(candidate);
        return new NextResponse(file, { headers: { "Content-Type": contentType } });
      } catch {
        // keep searching
      }
    }
  } catch {
    // uploadsDir itself missing
  }

  return NextResponse.json({ error: "Not found", basename }, { status: 404 });
}

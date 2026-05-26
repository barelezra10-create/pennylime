import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/**
 * Serves the signed agreement PDF to the currently-authenticated portal
 * customer. Bypasses /api/files (which is admin-only) and enforces that
 * the customer can ONLY ever read their own contract — we look up the
 * Document by their session's applicationId.
 */
export async function GET() {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return new NextResponse("Unauthorized", { status: 401 });

  const doc = await prisma.document.findFirst({
    where: { applicationId, documentType: "SIGNED_AGREEMENT_PDF" },
    orderBy: { createdAt: "desc" },
  });
  if (!doc) return new NextResponse("Contract not found", { status: 404 });

  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const resolved = path.resolve(doc.storagePath);
  if (!resolved.startsWith(uploadsDir)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Same fallback search as /api/files in case the absolute path drifted
  // between deploys but the file lives in a date subfolder.
  let file: Buffer | null = null;
  try {
    file = await fs.readFile(resolved);
  } catch {
    const basename = path.basename(resolved);
    try {
      const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          file = await fs.readFile(path.join(uploadsDir, entry.name, basename));
          break;
        } catch {
          // keep searching
        }
      }
    } catch {
      // uploadsDir missing
    }
  }
  if (!file) return new NextResponse("Contract file missing", { status: 404 });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

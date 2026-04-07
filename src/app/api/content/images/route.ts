import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { createContentImage, deleteContentImage, getContentImages } from "@/actions/content";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "content");
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_SIZE = 5 * 1024 * 1024;

export async function GET() {
  const images = await getContentImages();
  return NextResponse.json(images);
}

export async function POST(request: NextRequest) {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const altText = formData.get("altText") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${timestamp}-${safeName}`;
    const storagePath = `/uploads/content/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, fileName), buffer);

    const image = await createContentImage({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storagePath,
      altText: altText || undefined,
    });

    return NextResponse.json(image);
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id, storagePath } = await request.json();
    const filePath = join(process.cwd(), "public", storagePath);
    try { await unlink(filePath); } catch {}
    await deleteContentImage(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Image delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

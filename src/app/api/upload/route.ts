import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { getLoanRules } from "@/lib/rules-engine";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const rules = await getLoanRules();
    const maxSizeMb = parseFloat(rules.max_file_size_mb || "10");
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    const results = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            error: `Invalid file type: ${file.type}. Allowed: PDF, PNG, JPEG`,
          },
          { status: 400 }
        );
      }

      if (file.size > maxSizeBytes) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds ${maxSizeMb}MB limit` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const storagePath = await storage.upload(buffer, file.name);

      results.push({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath,
      });
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// NOTE: SOCIAL_IMAGE_DIR defaults to /tmp/pennylime-social which is ephemeral on Railway.
// Files disappear on restart. This is acceptable for v1: images are uploaded to platform
// CDNs (IG/FB/LI/TT) immediately at publish time, making the local copy a short-lived
// intermediary. A future task can swap this to Cloudflare R2 or a Railway Volume if
// persistence between restarts is needed.
const STORAGE_DIR = process.env.SOCIAL_IMAGE_DIR ?? "/tmp/pennylime-social";
const PUBLIC_BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_URL) {
  throw new Error("NEXTAUTH_URL must be set in production (required for social image URLs)");
}

export async function saveImage(buffer: Buffer, ext: string): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(STORAGE_DIR, name), buffer);
  return `${PUBLIC_BASE}/api/social/image/${name}`;
}

export async function readImage(name: string): Promise<Buffer | null> {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) return null;
  const filePath = path.resolve(STORAGE_DIR, safe);
  // defense-in-depth: ensure resolved path stays inside STORAGE_DIR
  const dirRoot = path.resolve(STORAGE_DIR);
  if (!filePath.startsWith(dirRoot + path.sep)) return null;
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function deleteImage(name: string): Promise<void> {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) return;
  const filePath = path.resolve(STORAGE_DIR, safe);
  const dirRoot = path.resolve(STORAGE_DIR);
  if (!filePath.startsWith(dirRoot + path.sep)) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore — file may not exist or already deleted
  }
}

import type { StorageProvider } from "@/types";
import fs from "fs/promises";
import path from "path";

class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    // Resolve to an absolute path at construction time so subsequent
    // reads work regardless of process.cwd() — relative paths break
    // when storage.read() is called from a request whose working
    // directory differs from when upload() ran.
    this.uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  }

  async upload(file: Buffer, filename: string): Promise<string> {
    const dir = path.join(this.uploadDir, this.getDateFolder());
    await fs.mkdir(dir, { recursive: true });
    const uniqueName = `${Date.now()}-${filename}`;
    const filePath = path.join(dir, uniqueName);
    await fs.writeFile(filePath, file);
    return filePath;
  }

  async read(storagePath: string): Promise<Buffer> {
    // Old rows may have relative paths from before we resolved
    // uploadDir to absolute. Best-effort: try the stored path first,
    // fall back to joining with the current uploadDir.
    try {
      return await fs.readFile(storagePath);
    } catch {
      // If the stored path was relative, try resolving against the
      // current absolute upload dir.
      if (!path.isAbsolute(storagePath)) {
        const absolute = path.resolve(storagePath);
        return await fs.readFile(absolute);
      }
      throw new Error(`Storage path not readable: ${storagePath}`);
    }
  }

  getUrl(storagePath: string): string {
    return `/api/files/${encodeURIComponent(storagePath)}`;
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(storagePath).catch(() => {});
  }

  private getDateFolder(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
}

export const storage: StorageProvider = new LocalStorageProvider();

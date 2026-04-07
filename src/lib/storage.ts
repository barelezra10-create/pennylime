import type { StorageProvider } from "@/types";
import fs from "fs/promises";
import path from "path";

class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || "./uploads";
  }

  async upload(file: Buffer, filename: string): Promise<string> {
    const dir = path.join(this.uploadDir, this.getDateFolder());
    await fs.mkdir(dir, { recursive: true });
    const uniqueName = `${Date.now()}-${filename}`;
    const filePath = path.join(dir, uniqueName);
    await fs.writeFile(filePath, file);
    return filePath;
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

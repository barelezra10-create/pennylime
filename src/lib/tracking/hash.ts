import { createHash } from "crypto";

export function sha256Hex(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

export function normalizePhone(p: string | null | undefined): string | undefined {
  if (!p) return undefined;
  const digits = p.replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
}

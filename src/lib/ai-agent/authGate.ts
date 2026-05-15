import type { AuthLevel } from "./types";

const RANK: Record<AuthLevel, number> = { anon: 0, "phone-matched": 1, verified: 2 };

export function meetsAuth(current: AuthLevel, required: AuthLevel): boolean {
  return RANK[current] >= RANK[required];
}

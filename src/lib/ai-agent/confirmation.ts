import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function loadSecret(): string {
  const fromEnv = process.env.AGENT_CONFIRM_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AGENT_CONFIRM_SECRET must be set in production");
  }
  return randomBytes(32).toString("hex");
}

const SECRET = loadSecret();
const MAX_AGE_MS = 90_000;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function digest(ts: string, sessionId: string, tool: string, payload: unknown): string {
  const body = JSON.stringify({ ts, sessionId, tool, payload });
  return createHmac("sha256", SECRET).update(body).digest("hex").slice(0, 24);
}

export function issueToken(sessionId: string, tool: string, payload: unknown): string {
  const ts = Date.now().toString(36);
  const d = digest(ts, sessionId, tool, payload);
  return `${ts}.${d}`;
}

export function verifyToken(token: string, sessionId: string, tool: string, payload: unknown): boolean {
  const [ts, d] = token.split(".");
  if (!ts || !d) return false;
  const issuedAt = parseInt(ts, 36);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > MAX_AGE_MS) return false;
  return timingSafeEqualHex(d, digest(ts, sessionId, tool, payload));
}

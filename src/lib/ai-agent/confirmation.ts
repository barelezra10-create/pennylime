import { createHmac, randomBytes } from "node:crypto";

const SECRET = process.env.AGENT_CONFIRM_SECRET || randomBytes(32).toString("hex");
const MAX_AGE_MS = 90_000;

function digest(sessionId: string, tool: string, payload: unknown): string {
  const body = JSON.stringify({ sessionId, tool, payload });
  return createHmac("sha256", SECRET).update(body).digest("hex").slice(0, 24);
}

export function issueToken(sessionId: string, tool: string, payload: unknown): string {
  const ts = Date.now().toString(36);
  const d = digest(sessionId, tool, payload);
  return `${ts}.${d}`;
}

export function verifyToken(token: string, sessionId: string, tool: string, payload: unknown): boolean {
  const [ts, d] = token.split(".");
  if (!ts || !d) return false;
  const issuedAt = parseInt(ts, 36);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > MAX_AGE_MS) return false;
  return d === digest(sessionId, tool, payload);
}

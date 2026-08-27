import "server-only";
import crypto from "node:crypto";

/**
 * Single-purpose signed token for the customer-facing "update your bank
 * account" page. Unlike the portal session cookie (see portal-auth.ts) this
 * token is scoped ONLY to the bank-update flow: it is passed in the URL, it
 * grants no portal access, and it carries a distinct purpose prefix in the
 * HMAC input so a portal cookie can never be replayed as a bank-update token
 * (or vice versa).
 *
 * Format:  <applicationId>.<expiresAtUnix>.<hmac>
 *   hmac = sha256("bankupdate:" + applicationId + "." + expiresAt) keyed by secret
 *
 * Stateless (no DB row). The token carries its own expiry.
 */
const PURPOSE = "bankupdate:";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.PORTAL_SESSION_SECRET || "pl-portal-dev-secret";
}

function sign(applicationId: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${PURPOSE}${applicationId}.${expiresAt}`)
    .digest("hex")
    .slice(0, 32);
}

export function signBankUpdateToken(applicationId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = sign(applicationId, expiresAt);
  return `${applicationId}.${expiresAt}.${sig}`;
}

/** Returns the applicationId if the token is valid and unexpired, else null. */
export function verifyBankUpdateToken(token: string): string | null {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const [applicationId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  const expected = sign(applicationId, expiresAt);
  // Constant-time compare.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return applicationId;
}

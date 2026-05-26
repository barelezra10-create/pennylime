import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const COOKIE = "pl_portal";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  // NEXTAUTH_SECRET is already set in production for admin sessions; reuse it
  // as the HMAC key for portal sessions so we don't need a separate env var.
  return process.env.NEXTAUTH_SECRET || process.env.PORTAL_SESSION_SECRET || "pl-portal-dev-secret";
}

/**
 * Session token format:
 *   <applicationId>.<expiresAtUnix>.<hmac>
 * where hmac = sha256(applicationId.expiresAtUnix) keyed by the secret.
 *
 * Stateless: no DB table needed. Compromise of the secret invalidates all
 * tokens. Token carries its own expiry so we can rotate without server-side
 * cleanup.
 */
function sign(applicationId: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${applicationId}.${expiresAt}`)
    .digest("hex")
    .slice(0, 32);
}

export async function signInPortal(applicationId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = sign(applicationId, expiresAt);
  const value = `${applicationId}.${expiresAt}.${sig}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getPortalApplicationId(): Promise<string | null> {
  const jar = await cookies();
  const c = jar.get(COOKIE);
  if (!c) return null;
  const parts = c.value.split(".");
  if (parts.length !== 3) return null;
  const [applicationId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  const expected = sign(applicationId, expiresAt);
  if (sig !== expected) return null;
  return applicationId;
}

export async function signOutPortal(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Phone matching strategy: borrower might enter their phone with or without
 * country code or formatting (+1 555 555 5555 vs 5555555555). We strip all
 * non-digits before comparing so the lookup tolerates whatever they type.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D+/g, "");
}

export async function findApplicationByPhone(phone: string): Promise<{ id: string; phone: string; firstName: string } | null> {
  const target = normalizePhone(phone);
  if (target.length < 10) return null;
  const last10 = target.slice(-10);

  // Match on last-10 digits to dodge country-code mismatches. Most US
  // phones are stored either as +15555555555 or 5555555555.
  const candidates = await prisma.application.findMany({
    where: { phone: { contains: last10 } },
    orderBy: { createdAt: "desc" },
    select: { id: true, phone: true, firstName: true },
  });

  return candidates.find((c) => normalizePhone(c.phone).endsWith(last10)) || null;
}

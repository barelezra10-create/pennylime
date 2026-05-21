import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "pl_partner";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const DEFAULT_PARTNER_PASSWORD = "Penny2026!";

function getPassword(): string {
  return process.env.PARTNER_VIEW_PASSWORD || DEFAULT_PARTNER_PASSWORD;
}

export function getPartnerPassword(): string {
  return getPassword();
}

function tokenFor(password: string): string {
  return crypto.createHash("sha256").update(`partner:${password}`).digest("hex").slice(0, 32);
}

export async function isPartnerAuthed(): Promise<boolean> {
  const jar = await cookies();
  const c = jar.get(COOKIE);
  if (!c) return false;
  return c.value === tokenFor(getPassword());
}

export async function signInPartner(submittedPassword: string): Promise<boolean> {
  if (submittedPassword !== getPassword()) return false;
  const jar = await cookies();
  jar.set(COOKIE, tokenFor(getPassword()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function signOutPartner(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

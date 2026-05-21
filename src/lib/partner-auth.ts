import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "pl_partner";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getPassword(): string | null {
  return process.env.PARTNER_VIEW_PASSWORD || null;
}

function tokenFor(password: string): string {
  return crypto.createHash("sha256").update(`partner:${password}`).digest("hex").slice(0, 32);
}

export async function isPartnerAuthed(): Promise<boolean> {
  const password = getPassword();
  if (!password) return false;
  const jar = await cookies();
  const c = jar.get(COOKIE);
  if (!c) return false;
  return c.value === tokenFor(password);
}

export async function signInPartner(submittedPassword: string): Promise<boolean> {
  const password = getPassword();
  if (!password) return false;
  if (submittedPassword !== password) return false;
  const jar = await cookies();
  jar.set(COOKIE, tokenFor(password), {
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

export function isPartnerEnabled(): boolean {
  return !!getPassword();
}

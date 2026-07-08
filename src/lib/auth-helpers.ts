import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Only the SUPPORT role is restricted; ADMIN, REP, and legacy sessions without a role keep full access. */
export function isSupportRole(role: string | null | undefined): boolean {
  return role === "SUPPORT";
}

/** Guard for money-moving actions: rejects SUPPORT sessions, passes everyone else authenticated. */
export async function requireNonSupportRole(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };
  const role = (session.user as { role?: string }).role;
  if (isSupportRole(role)) return { ok: false, error: "Not permitted for support role" };
  return { ok: true, email: session.user.email };
}

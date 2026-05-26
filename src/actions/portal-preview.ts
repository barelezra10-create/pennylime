"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signInPortal } from "@/lib/portal-auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * Admin-only: drop into the customer portal as if you were the applicant.
 * Sets the same portal cookie the customer would get after phone+SMS
 * verification, so subsequent /portal requests render exactly what the
 * customer would see. Audit-logged.
 *
 * Use it to QA portal UI without spinning up a test phone or pulling
 * out a Twilio code. Browser session shares the portal cookie, so the
 * caller's preview lasts the cookie's 30-day TTL or until they sign out
 * of /portal.
 */
export async function previewPortalAs(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, applicationCode: true, firstName: true, lastName: true },
  });
  if (!app) return { ok: false as const, error: "Application not found" };

  await signInPortal(app.id);

  await logAudit({
    action: "PORTAL_PREVIEW_AS_CUSTOMER",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: session.user.email,
    details: { applicationCode: app.applicationCode, firstName: app.firstName },
  });

  return {
    ok: true as const,
    applicationCode: app.applicationCode,
    firstName: app.firstName,
    lastName: app.lastName,
  };
}

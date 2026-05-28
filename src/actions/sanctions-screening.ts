"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { screenViaOpenSanctions } from "@/lib/compliance/sanctions/opensanctions";

/**
 * High-confidence match threshold. Anything ≥ this score = MATCH.
 * Below this but ≥ REVIEW_THRESHOLD = REVIEW. Below REVIEW = CLEAR.
 *
 * OpenSanctions score ranges 0-1. 0.85 is the common production setting
 * for "stop and block." 0.55 catches loose name overlaps for human review.
 */
const MATCH_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.55;

type ScreeningStatus = "CLEAR" | "REVIEW" | "MATCH";

function classify(score: number): ScreeningStatus {
  if (score >= MATCH_THRESHOLD) return "MATCH";
  if (score >= REVIEW_THRESHOLD) return "REVIEW";
  return "CLEAR";
}

/**
 * Screen an applicant against OFAC/PEP via OpenSanctions and persist
 * the result. Idempotent — overwrites the latest result for the
 * application. Best-effort: if the API is down, returns ok with the
 * existing record (or creates a stub marked REVIEW with the error
 * note so an admin investigates).
 */
export async function screenApplicantSanctions(applicationId: string): Promise<
  | { ok: true; status: ScreeningStatus; hitCount: number; screeningId: string }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  // Allow system callers (no session) so the application-submit hook can
  // run this without admin auth. Admin-initiated screens DO require a
  // session and we record the email in performedBy.
  const callerLabel = session?.user?.email || "system:auto-screen";

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      addressState: true,
    },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const fullName = `${app.firstName} ${app.lastName}`.trim();
  if (!fullName) return { ok: false, error: "Application has no name to screen" };

  // dateOfBirth is stored as string from form; pass through as-is if it
  // looks like a date.
  const dob = app.dateOfBirth && /\d/.test(app.dateOfBirth) ? app.dateOfBirth : null;

  const r = await screenViaOpenSanctions({
    fullName,
    dateOfBirth: dob,
    addressCountry: "us",
  });

  if (!r.ok) {
    // Record a stub so admin sees something + investigates. Marked
    // REVIEW so it can't be ignored as CLEAR.
    const stub = await prisma.sanctionsScreening.create({
      data: {
        applicationId: app.id,
        fullName,
        dateOfBirth: dob,
        addressCountry: "US",
        provider: "opensanctions",
        status: "REVIEW",
        hitCount: 0,
        rawResponse: JSON.stringify({ error: r.error }).slice(0, 100_000),
      },
    });
    await logAudit({
      action: "AI_RISK_ANALYSIS",
      entityType: "APPLICATION",
      entityId: app.id,
      performedBy: callerLabel,
      details: {
        kind: "SANCTIONS_SCREEN_FAILED",
        screeningId: stub.id,
        error: r.error.slice(0, 200),
      },
    });
    return { ok: false, error: r.error };
  }

  // Determine the worst classification across all results.
  let highestScore = 0;
  for (const res of r.results) {
    if (res.score > highestScore) highestScore = res.score;
  }
  const status = classify(highestScore);
  const hitCount = r.results.filter((res) => res.score >= REVIEW_THRESHOLD).length;

  const screening = await prisma.sanctionsScreening.create({
    data: {
      applicationId: app.id,
      fullName,
      dateOfBirth: dob,
      addressCountry: "US",
      provider: "opensanctions",
      status,
      hitCount,
      rawResponse: JSON.stringify(r.rawResponse).slice(0, 100_000),
    },
  });

  await logAudit({
    action: "AI_RISK_ANALYSIS",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: callerLabel,
    details: {
      kind: "SANCTIONS_SCREENED",
      screeningId: screening.id,
      status,
      hitCount,
      highestScore,
    },
  });

  return { ok: true, status, hitCount, screeningId: screening.id };
}

/**
 * Mark a REVIEW or MATCH screening as cleared by an admin (e.g. after
 * confirming the hit was a name collision, not the actual person). Adds
 * a reviewNote and stamps reviewer + time. Doesn't delete the original
 * screen — preserves the audit trail.
 */
export async function clearSanctionsScreening(input: {
  screeningId: string;
  reviewNote: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const note = input.reviewNote.trim();
  if (note.length < 10) {
    return { ok: false, error: "Please provide a substantive note (10+ characters) explaining the clearance" };
  }

  const existing = await prisma.sanctionsScreening.findUnique({
    where: { id: input.screeningId },
    select: { id: true, applicationId: true, status: true },
  });
  if (!existing) return { ok: false, error: "Screening not found" };

  await prisma.sanctionsScreening.update({
    where: { id: input.screeningId },
    data: {
      status: "CLEAR",
      reviewedBy: session.user.email,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });

  await logAudit({
    action: "CHANGE_SETTING",
    entityType: "APPLICATION",
    entityId: existing.applicationId,
    performedBy: session.user.email,
    details: {
      kind: "SANCTIONS_SCREEN_CLEARED",
      screeningId: input.screeningId,
      prevStatus: existing.status,
      note,
    },
  });

  return { ok: true };
}

/**
 * Get the latest sanctions screening result for an application.
 * Returns null if never screened.
 */
export async function getLatestSanctionsScreening(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.sanctionsScreening.findFirst({
    where: { applicationId },
    orderBy: { screenedAt: "desc" },
  });
}

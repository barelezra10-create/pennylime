"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CLOSED_STATUSES, retentionDates } from "@/lib/security/retention-policy";
import { revalidatePath } from "next/cache";
export async function recordRetentionDecision(data: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || (session.user as { role?: string }).role !== "ADMIN") throw new Error("Administrator access required");
  const applicationId = String(data.get("applicationId") || "");
  const ended = String(data.get("endedAt") || "");
  const relationshipEndedAt = ended ? new Date(`${ended}T00:00:00Z`) : null;
  const legalHold = data.get("legalHold") === "on";
  const holdReason = String(data.get("holdReason") || "").trim();
  if (legalHold && !holdReason) throw new Error("Enter the legal hold reason");
  if (relationshipEndedAt && (!Number.isFinite(relationshipEndedAt.getTime()) || relationshipEndedAt > new Date())) throw new Error("Invalid end date");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${applicationId} FOR UPDATE`;
    const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    if (relationshipEndedAt && (!CLOSED_STATUSES.includes(app.status) || relationshipEndedAt < new Date(app.createdAt.toISOString().slice(0,10)))) throw new Error("Only closed applications with a valid relationship end date can be scheduled");
    const values = { relationshipEndedAt, legalHold, holdReason: holdReason || null, reviewedBy: session.user!.email!, reviewedAt: new Date(),
      recordReviewDueAt: relationshipEndedAt ? retentionDates(relationshipEndedAt).recordReviewAt : null };
    await tx.retentionCase.upsert({ where: { applicationId }, create: { applicationId, ...values }, update: values });
    await tx.auditLog.create({ data: { action: "RETENTION_REVIEWED", entityType: "APPLICATION", entityId: applicationId,
      performedBy: session.user!.email!, details: JSON.stringify({ relationshipEndedAt, legalHold }) } });
  });
  revalidatePath("/admin/security");
}

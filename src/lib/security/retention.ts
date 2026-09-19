import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { plaidClient } from "@/lib/plaid";
import { CLOSED_STATUSES, eligibleForPlaidRevocation } from "./retention-policy";
/** No historical customer files are erased by this job. Record disposal requires review of all holds and related records. */
export async function runRetentionReview() {
  const now = new Date();
  const cases = await prisma.retentionCase.findMany({ where: { relationshipEndedAt: { lte: new Date(now.getTime() - 30 * 86_400_000) }, legalHold: false, plaidRevokedAt: null }, take: 100, orderBy: { reviewedAt: "asc" } });
  const summary = { reviewed: cases.length, eligible: 0, revoked: 0, skipped: 0, failed: 0, enforcement: process.env.RETENTION_REVOKE_ENABLED === "true", expiredChallengesRemoved: 0 };
  for (const c of cases) {
    try {
      const result = await prisma.$transaction(async tx => {
        // Serialize against admin decisions and concurrent runs. Re-read after lock.
        await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${c.applicationId} FOR UPDATE`;
        const app = await tx.application.findUnique({ where: { id: c.applicationId } });
        const review = await tx.retentionCase.findUnique({ where: { id: c.id } });
        if (!app || !review) return "skipped";
        const related = await tx.application.count({ where: { id: { not: app.id }, status: { notIn: CLOSED_STATUSES }, OR: [
          { email: { equals: app.email, mode: "insensitive" } },
          ...(app.ssnHash ? [{ ssnHash: app.ssnHash }] : []),
          ...(app.plaidItemId ? [{ plaidItemId: app.plaidItemId }] : []),
        ] } });
        if (!eligibleForPlaidRevocation({ status: app.status, endedAt: review.relationshipEndedAt, legalHold: review.legalHold,
          revokedAt: review.plaidRevokedAt, hasOtherActiveRelationship: related > 0, now })) return "skipped";
        if (!summary.enforcement) return "eligible";
        if (app.plaidAccessToken) {
          try { await plaidClient.itemRemove({ access_token: decrypt(app.plaidAccessToken) }, { timeout: 10_000 }); }
          catch (error) {
            // Already removed is an idempotent success; all other API failures leave tokens for retry.
            const code = (error as { response?: { data?: { error_code?: string } } }).response?.data?.error_code;
            if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") throw error;
          }
        }
        await tx.application.update({ where: { id: app.id }, data: { plaidAccessToken: null, plaidUserToken: null, plaidLinkStale: true } });
        await tx.retentionCase.update({ where: { id: review.id }, data: { plaidRevokedAt: now } });
        await tx.auditLog.create({ data: { action: "RETENTION_PLAID_REVOKED", entityType: "APPLICATION", entityId: app.id, performedBy: "retention-job" } });
        return "revoked";
      }, { timeout: 20_000, maxWait: 5000 });
      summary[result]++;
    } catch { summary.failed++; }
  }
  summary.expiredChallengesRemoved = (await prisma.adminMfaChallenge.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  await prisma.securityReview.create({ data: { kind: "RETENTION_DAILY", summary: JSON.stringify(summary) } });
  return summary;
}

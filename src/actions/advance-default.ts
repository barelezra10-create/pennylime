"use server";

import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

export async function markAdvanceDefault(applicationId: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const changed = await prisma.$transaction(async (tx) => {
    // Conditional update prevents stale clicks from defaulting a paid/closed account.
    const result = await tx.application.updateMany({
      where: { id: applicationId, status: { in: ["FUNDED", "ACTIVE", "REPAYING", "LATE"] } },
      data: { status: "DEFAULTED" },
    });
    if (!result.count) return false;
    await tx.collectionEvent.create({ data: {
      applicationId, eventType: "DEFAULTED", performedBy: auth.email,
      notes: "Manually moved from Active to Default",
    } });
    await tx.auditLog.create({ data: {
      action: "COLLECTIONS_ESCALATION", entityType: "APPLICATION", entityId: applicationId,
      performedBy: auth.email, details: JSON.stringify({ escalatedTo: "DEFAULTED", manual: true }),
    } });
    const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { payments: true } });
    if (app.ssnHash) {
      await tx.riskProfile.create({ data: {
        applicationId, ssnHash: app.ssnHash, platform: app.platform ?? "unknown",
        monthlyIncome: app.monthlyIncome ?? 0, loanAmount: app.loanAmount,
        loanTermMonths: app.loanTermMonths ?? 12, interestRate: app.interestRate ?? 0,
        outcome: "DEFAULTED", defaultedAt: new Date(),
        totalPaid: app.payments.filter(p => p.status === "PAID").reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0),
        totalOwed: app.payments.reduce((sum, p) => sum + Number(p.amount), 0),
        latePaymentCount: app.payments.filter(p => Number(p.lateFee) > 0).length,
      } });
    }
    return true;
  });
  if (!changed) return { success: false, error: "Only Active accounts can be moved to Default. Refresh and try again." };
  revalidatePath("/admin", "layout");
  return { success: true };
}

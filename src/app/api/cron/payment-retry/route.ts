import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { initiateACHDebit } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { getLoanRules } from "@/lib/rules-engine";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const rules = await getLoanRules();
  const collectionsThresholdDays = parseInt(rules.collections_threshold_days || "30");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - collectionsThresholdDays);

  // Find FAILED payments that are less than 30 days old (not yet in COLLECTIONS territory)
  const failedPayments = await prisma.payment.findMany({
    where: {
      status: "FAILED",
      dueDate: { gte: cutoffDate },
    },
    include: { application: true },
  });

  let retried = 0;
  let errors = 0;

  for (const payment of failedPayments) {
    // Skip if application is already in COLLECTIONS or DEFAULTED
    if (payment.application.status === "COLLECTIONS" || payment.application.status === "DEFAULTED") {
      continue;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PROCESSING" },
    });

    const result = await initiateACHDebit(payment.id);

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          achTransferId: result.transferId,
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      await logAudit({
        action: "RETRY_PAYMENT",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-retry",
        details: { retryCount: payment.retryCount + 1 },
      });

      retried++;
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });
      errors++;
    }
  }

  return NextResponse.json({ found: failedPayments.length, retried, errors });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { initiateACHDebit } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Find all PENDING payments due today or earlier
  const duePayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: today },
    },
    include: { application: true },
  });

  const results: { paymentId: string; success: boolean; error?: string }[] = [];

  for (const payment of duePayments) {
    // Set to PROCESSING first to prevent double-debit
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PROCESSING" },
    });

    const result = await initiateACHDebit(payment.id);

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { achTransferId: result.transferId },
      });

      await logAudit({
        action: "INITIATE_ACH",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-processor",
        details: { transferId: result.transferId, amount: Number(payment.amount) },
      });

      results.push({ paymentId: payment.id, success: true });
    } else {
      // Revert to FAILED if ACH initiation fails
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", retryCount: { increment: 1 }, lastRetryAt: new Date() },
      });

      // Send failure email to borrower (spec: Day 0 failure notification)
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
      });

      results.push({ paymentId: payment.id, success: false, error: result.error });
    }
  }

  return NextResponse.json({
    processed: duePayments.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}

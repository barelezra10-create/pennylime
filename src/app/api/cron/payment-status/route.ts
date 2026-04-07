import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { checkTransferStatus } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentSuccessEmail } from "@/lib/emails/payment-success";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import { calculateRemainingBalance } from "@/lib/amortization";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // Find all PROCESSING payments with a transfer ID
  const processingPayments = await prisma.payment.findMany({
    where: {
      status: "PROCESSING",
      achTransferId: { not: null },
    },
    include: {
      application: {
        include: { payments: true },
      },
    },
  });

  let settled = 0;
  let failed = 0;
  let pending = 0;

  for (const payment of processingPayments) {
    const status = await checkTransferStatus(payment.achTransferId!);

    if (status === "posted") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      await logAudit({
        action: "PAYMENT_RECEIVED",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-status",
        details: { amount: Number(payment.amount) + Number(payment.lateFee) },
      });

      // Calculate remaining balance (excluding this payment which is now PAID)
      const allPayments = payment.application.payments.map((p) =>
        p.id === payment.id ? { ...p, status: "PAID" } : p
      );
      const remaining = calculateRemainingBalance(
        allPayments.map((p) => ({ principal: Number(p.principal), status: p.status }))
      );

      // Check if loan is fully paid off
      if (remaining <= 0) {
        await prisma.application.update({
          where: { id: payment.applicationId },
          data: { status: "PAID_OFF" },
        });

        // Create RiskProfile for training data
        const allPayments = await prisma.payment.findMany({
          where: { applicationId: payment.applicationId },
        });
        const totalPaid = allPayments
          .filter((p) => p.status === "PAID")
          .reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0);
        const totalOwed = allPayments
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const latePaymentCount = allPayments
          .filter((p) => Number(p.lateFee) > 0).length;

        const app = await prisma.application.findUnique({
          where: { id: payment.applicationId },
        });

        if (app?.ssnHash) {
          await prisma.riskProfile.create({
            data: {
              applicationId: payment.applicationId,
              ssnHash: app.ssnHash,
              platform: app.platform ?? "unknown",
              monthlyIncome: app.monthlyIncome ?? 0,
              loanAmount: app.loanAmount,
              loanTermMonths: app.loanTermMonths ?? 12,
              interestRate: app.interestRate ?? 0,
              outcome: "PAID_OFF",
              totalPaid,
              totalOwed,
              latePaymentCount,
              completedAt: new Date(),
            },
          });

          // Check retrain threshold
          const { checkAndTriggerRetrain } = await import("@/lib/risk-model");
          await checkAndTriggerRetrain();
        }
      } else {
        // If loan was LATE and all overdue payments caught up, revert to ACTIVE
        const overduePayments = allPayments.filter(
          (p) => p.status === "FAILED" || p.status === "LATE"
        );
        if (overduePayments.length === 0 && payment.application.status === "LATE") {
          await prisma.application.update({
            where: { id: payment.applicationId },
            data: { status: "ACTIVE" },
          });
        }
      }

      // Send success email
      await sendEmail({
        to: payment.application.email,
        ...paymentSuccessEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount) + Number(payment.lateFee),
          remainingBalance: remaining,
        }),
      });

      settled++;
    } else if (status === "failed" || status === "cancelled") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      // Send failure email
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
      });

      failed++;
    } else {
      pending++;
    }
  }

  return NextResponse.json({ processed: processingPayments.length, settled, failed, pending });
}

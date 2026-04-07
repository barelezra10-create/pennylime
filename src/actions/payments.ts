"use server";

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getPaymentsByApplicationId(applicationId: string) {
  return prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
  });
}

export async function getPaymentsSummary(applicationId: string) {
  const payments = await prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
  });

  const totalOwed = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalLateFees = payments.reduce((s, p) => s + Number(p.lateFee), 0);
  const nextPayment = payments.find(
    (p) => p.status === "PENDING" || p.status === "FAILED"
  );
  const remainingBalance = totalOwed - totalPaid;

  return {
    payments,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalLateFees: Math.round(totalLateFees * 100) / 100,
    remainingBalance: Math.round(remainingBalance * 100) / 100,
    nextPayment,
  };
}

export async function retryPayment(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (payment.status !== "FAILED" && payment.status !== "LATE" && payment.status !== "COLLECTIONS") {
    return { success: false, error: "Payment cannot be retried in current status" };
  }

  // Mark as PROCESSING so cron doesn't double-debit
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "PROCESSING",
      retryCount: { increment: 1 },
      lastRetryAt: new Date(),
    },
  });

  // Initiate the ACH debit
  const { initiateACHDebit } = await import("@/lib/plaid-transfer");
  const result = await initiateACHDebit(paymentId);

  if (result.success) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { achTransferId: result.transferId },
    });
  } else {
    // Revert to FAILED if ACH initiation fails
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED" },
    });
    return { success: false, error: result.error };
  }

  await logAudit({
    action: "RETRY_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: { applicationId: payment.applicationId, paymentNumber: payment.paymentNumber },
  });

  return { success: true };
}

export async function waiveLateFee(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (Number(payment.lateFee) === 0) {
    return { success: false, error: "No late fee to waive" };
  }

  const waivedAmount = Number(payment.lateFee);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { lateFee: 0 },
  });

  await logAudit({
    action: "WAIVE_FEE",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: { waivedAmount, applicationId: payment.applicationId },
  });

  return { success: true, waivedAmount };
}

export async function getAllPayments(status?: string) {
  const where = status && status !== "ALL" ? { status } : {};
  return prisma.payment.findMany({
    where,
    include: {
      application: {
        select: {
          firstName: true,
          lastName: true,
          applicationCode: true,
          email: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
}

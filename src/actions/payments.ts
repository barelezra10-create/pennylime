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
    include: {
      attempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  // WAIVED / CANCELED / RETURNED rows shouldn't count as "owed" — they
  // represent payments that were collapsed into a payoff or returned to
  // the customer. Otherwise post-payoff customers still see a balance.
  const obligatedPayments = payments.filter(
    (p) => p.status !== "WAIVED" && p.status !== "CANCELED" && p.status !== "RETURNED",
  );
  const totalOwed = obligatedPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalLateFees = obligatedPayments.reduce((s, p) => s + Number(p.lateFee), 0);
  const nextPayment = payments.find(
    (p) => p.status === "PENDING" || p.status === "FAILED"
  );
  const remainingBalance = Math.max(totalOwed - totalPaid, 0);

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
  // Recharge covers any non-paid state where pulling again makes sense:
  // a failed ACH, an NSF return, a missed-cron LATE flag, or a PENDING
  // row whose due date has already passed (so the borrower is overdue
  // but we never attempted the debit yet).
  const overduePending =
    payment.status === "PENDING" && payment.dueDate && payment.dueDate.getTime() < Date.now();
  const retriable =
    payment.status === "FAILED" ||
    payment.status === "LATE" ||
    payment.status === "RETURNED" ||
    payment.status === "COLLECTIONS" ||
    overduePending;
  if (!retriable) {
    return { success: false, error: `Payment is ${payment.status} and not overdue, nothing to recharge.` };
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
      data: {
        achTransferId: result.transferId,
        increaseTransferId: result.transferId,
        increaseTransferStatus: "pending_submission",
      },
    });
    const { recordAttemptStart } = await import("@/lib/payment-attempts");
    await recordAttemptStart({
      paymentId,
      initiatedBy: `admin:${session.user.email}`,
      amount: Number(payment.amount) + Number(payment.lateFee),
      transferId: result.transferId,
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

/**
 * Admin-triggered ACH debit for a PENDING payment, ahead of its
 * scheduled cron run. Same code path the daily cron uses — locks the
 * row to PROCESSING first so the cron doesn't double-debit, calls
 * Increase, then updates the row with the transfer id. Used by the
 * "Charge now" button on the application detail page.
 */
export async function chargePaymentNow(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { success: false, error: "Payment not found" };
  if (payment.status !== "PENDING") {
    return { success: false, error: `Payment is ${payment.status}, can only charge PENDING` };
  }

  // Lock to PROCESSING first so the daily cron can't double-debit.
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PROCESSING" },
  });

  const { initiateACHDebit } = await import("@/lib/plaid-transfer");
  const result = await initiateACHDebit(paymentId);

  if (!result.success) {
    // Roll back to PENDING so cron can retry, or admin can hit the
    // button again after fixing whatever was wrong.
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "PENDING" },
    });
    return { success: false, error: result.error };
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      achTransferId: result.transferId,
      increaseTransferId: result.transferId,
      increaseTransferStatus: "pending_submission",
    },
  });

  const { recordAttemptStart } = await import("@/lib/payment-attempts");
  await recordAttemptStart({
    paymentId,
    initiatedBy: `admin:${session.user.email}`,
    amount: Number(payment.amount) + Number(payment.lateFee),
    transferId: result.transferId,
  });

  await logAudit({
    action: "MANUAL_CHARGE_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: { applicationId: payment.applicationId, paymentNumber: payment.paymentNumber, transferId: result.transferId },
  });

  return { success: true, transferId: result.transferId };
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

/**
 * Send the borrower a friendly "we missed your remittance, tell us when
 * to retry" email. Used by admin when a payment is overdue/failed and
 * we want the borrower to pick a recharge date instead of auto-retrying.
 */
export async function sendMissedPaymentNotice(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });
  if (!payment) return { success: false, error: "Payment not found" };

  const { sendEmail } = await import("@/lib/emails/send");
  const { missedPaymentEmail } = await import("@/lib/emails/missed-payment");

  const contact = await prisma.contact.findFirst({
    where: { applicationId: payment.applicationId },
    select: { id: true },
  });

  try {
    await sendEmail({
      to: payment.application.email,
      ...missedPaymentEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount) + Number(payment.lateFee),
        dueDate: payment.dueDate,
      }),
      contactId: contact?.id,
      templateId: "payment-missed-notice",
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }

  await logAudit({
    action: "COLLECTIONS_ESCALATION",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: {
      kind: "missed_payment_notice",
      applicationId: payment.applicationId,
      paymentNumber: payment.paymentNumber,
      amount: Number(payment.amount) + Number(payment.lateFee),
    },
  });

  return { success: true };
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

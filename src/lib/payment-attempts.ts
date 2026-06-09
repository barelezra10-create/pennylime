import "server-only";
import { prisma } from "@/lib/db";

/**
 * One-stop helpers for the PaymentAttempt history table.
 *
 *   recordAttemptStart  — call right after a new ACH transfer is
 *                          created on Increase (payment-processor,
 *                          payment-retry, Charge now, Recharge now,
 *                          early-payoff portal flow).
 *
 *   updateAttemptStatus — call from the webhook / cron poll /
 *                          per-payment refresh action when we
 *                          observe a status change on Increase.
 *                          Matches by increaseTransferId so callers
 *                          don't have to thread attemptId.
 */

export async function recordAttemptStart(params: {
  paymentId: string;
  initiatedBy: string;
  amount: number;
  transferId: string | null;
  transferStatus?: string | null;
}): Promise<void> {
  const last = await prisma.paymentAttempt.findFirst({
    where: { paymentId: params.paymentId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  const nextNumber = (last?.attemptNumber ?? 0) + 1;
  await prisma.paymentAttempt.create({
    data: {
      paymentId: params.paymentId,
      attemptNumber: nextNumber,
      initiatedBy: params.initiatedBy,
      amount: params.amount,
      increaseTransferId: params.transferId,
      increaseTransferStatus: params.transferStatus ?? "pending_submission",
    },
  });
}

export async function updateAttemptStatus(params: {
  transferId: string;
  transferStatus: string;
  finalStatus?: "PAID" | "RETURNED" | "FAILED" | null;
  settledAt?: Date | null;
  returnReason?: string | null;
}): Promise<void> {
  const att = await prisma.paymentAttempt.findFirst({
    where: { increaseTransferId: params.transferId },
    select: { id: true, paymentId: true, amount: true, finalStatus: true },
  });
  if (!att) return;

  // Only credit collectedAmount when we're flipping a previously-
  // non-PAID attempt to PAID. Idempotent on repeated webhooks /
  // polls — the same attempt never gets counted twice.
  const newlySettled = params.finalStatus === "PAID" && att.finalStatus !== "PAID";

  await prisma.paymentAttempt.update({
    where: { id: att.id },
    data: {
      increaseTransferStatus: params.transferStatus,
      ...(params.finalStatus !== undefined ? { finalStatus: params.finalStatus } : {}),
      ...(params.settledAt !== undefined ? { settledAt: params.settledAt } : {}),
      ...(params.returnReason !== undefined ? { returnReason: params.returnReason } : {}),
    },
  });

  if (newlySettled) {
    // Sum every PAID attempt for this Payment, then set Payment
    // status from how that compares to amount: collected >= amount
    // -> PAID, else the original status (LATE / PROCESSING / etc.)
    // is restored so admin can keep collecting more.
    const paid = await prisma.paymentAttempt.aggregate({
      where: { paymentId: att.paymentId, finalStatus: "PAID" },
      _sum: { amount: true },
    });
    const collected = Number(paid._sum.amount ?? 0);
    const payment = await prisma.payment.findUnique({
      where: { id: att.paymentId },
      select: { amount: true, status: true },
    });
    if (!payment) return;
    const fullyCollected = collected + 0.01 >= Number(payment.amount);
    await prisma.payment.update({
      where: { id: att.paymentId },
      data: {
        collectedAmount: collected,
        ...(fullyCollected
          ? { status: "PAID", paidAt: params.settledAt ?? new Date() }
          : payment.status === "PROCESSING"
          ? { status: "PENDING" } // unfreeze for additional micro-collections
          : {}),
      },
    });
  }
}

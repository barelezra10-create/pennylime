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
    select: { id: true },
  });
  if (!att) return;
  await prisma.paymentAttempt.update({
    where: { id: att.id },
    data: {
      increaseTransferStatus: params.transferStatus,
      ...(params.finalStatus !== undefined ? { finalStatus: params.finalStatus } : {}),
      ...(params.settledAt !== undefined ? { settledAt: params.settledAt } : {}),
      ...(params.returnReason !== undefined ? { returnReason: params.returnReason } : {}),
    },
  });
}

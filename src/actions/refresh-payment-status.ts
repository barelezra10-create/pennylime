"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Admin-triggered on-demand sync of one Payment's Increase transfer
 * status. Same logic as the payment-status cron but for a single row,
 * so admins don't have to wait for the cron or the webhook when they
 * know a debit has settled at Increase already.
 *
 * Updates the DB based on the live Increase status and returns the
 * latest snapshot. Idempotent.
 */
export async function refreshPaymentStatus(paymentId: string): Promise<
  | { ok: true; status: string; transferStatus: string }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, increaseTransferId: true, status: true, goachTransactionUuid: true, paidAt: true },
  });
  if (!payment) return { ok: false, error: "Payment not found" };

  // --- GoACH branch: if this payment was processed via GoACH, use their API ---
  if (payment.goachTransactionUuid) {
    const { goachConfigured, getTransaction, mapGoachStatus } = await import("@/lib/goach");
    if (!goachConfigured()) return { ok: false, error: "GoACH not configured" };
    const { explainReturnCode } = await import("@/lib/ach-return-codes");
    const { updateAttemptStatus } = await import("@/lib/payment-attempts");

    const t = await getTransaction(payment.goachTransactionUuid);
    if (!t.ok) return { ok: false, error: t.error };

    let returnCode: string | null = null;
    if (mapGoachStatus(t.status, null).isReturned) {
      returnCode = t.returnCode;
    }
    const mapped = mapGoachStatus(t.status, returnCode);

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        increaseTransferStatus: t.status,
        status: mapped.paymentStatus,
        paidAt: mapped.isSettled ? new Date() : payment.paidAt,
        ...(returnCode ? { increaseReturnReason: explainReturnCode(returnCode) } : {}),
      },
    });
    try {
      await updateAttemptStatus({
        transferId: payment.goachTransactionUuid,
        transferStatus: t.status,
        finalStatus: mapped.isSettled ? "PAID" : mapped.isReturned ? "RETURNED" : mapped.paymentStatus === "FAILED" ? "FAILED" : undefined,
        settledAt: mapped.isSettled ? new Date() : undefined,
        returnReason: returnCode ? explainReturnCode(returnCode) : undefined,
      });
    } catch (err) {
      console.error(`[refresh-payment-status] goach attempt update failed for ${paymentId}:`, err);
    }

    return { ok: true, status: mapped.paymentStatus, transferStatus: t.status };
  }

  // --- Increase branch (original path) ---
  if (!payment.increaseTransferId) {
    return { ok: false, error: "No Increase transfer attached yet" };
  }

  const isRtp = payment.increaseTransferId.startsWith("real_time_payments_transfer_");
  const url = `https://api.increase.com${
    isRtp
      ? `/real_time_payments_transfers/${payment.increaseTransferId}`
      : `/ach_transfers/${payment.increaseTransferId}`
  }`;

  type IncreaseTransferPayload = {
    status?: string;
    return?: { return_reason_code?: string };
    rejection?: { reject_reason_code?: string };
  };
  let data: IncreaseTransferPayload | null = null;
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
        "Increase-Version": "2024-04-15",
      },
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `Increase ${r.status}: ${text.slice(0, 200)}` };
    }
    data = (await r.json()) as IncreaseTransferPayload;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }

  const newTransferStatus = data?.status || "unknown";
  // Map Increase statuses to our Payment.status enum.
  //   settled / complete         -> PAID
  //   returned / rejected        -> RETURNED (with reason code)
  //   submitted / pending_*      -> stay PROCESSING (still in flight)
  // Intermediate states like "pending_returning" must NOT flip to
  // RETURNED — the return is being processed but not final.
  let newPaymentStatus = payment.status;
  let paidAt: Date | null = null;
  let returnReason: string | null = null;
  if (newTransferStatus === "settled" || newTransferStatus === "complete") {
    newPaymentStatus = "PAID";
    paidAt = new Date();
  } else if (newTransferStatus === "returned" || newTransferStatus === "rejected") {
    newPaymentStatus = "RETURNED";
    const { explainReturnCode } = await import("@/lib/ach-return-codes");
    const code =
      data.return?.return_reason_code ?? data.rejection?.reject_reason_code ?? null;
    returnReason = explainReturnCode(code);
  } else if (payment.status === "RETURNED" || payment.status === "FAILED") {
    // Self-heal: if our DB row says RETURNED/FAILED but Increase is
    // still in a pending state, the local status was set prematurely
    // (e.g., by a previous mapping bug). Move it back to PROCESSING.
    newPaymentStatus = "PROCESSING";
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      increaseTransferStatus: newTransferStatus,
      ...(newPaymentStatus !== payment.status && { status: newPaymentStatus }),
      ...(paidAt && { paidAt }),
      ...(returnReason ? { increaseReturnReason: returnReason } : {}),
    },
  });
  try {
    const { updateAttemptStatus } = await import("@/lib/payment-attempts");
    await updateAttemptStatus({
      transferId: payment.increaseTransferId,
      transferStatus: newTransferStatus,
      finalStatus:
        newPaymentStatus === "PAID" ? "PAID" : newPaymentStatus === "RETURNED" ? "RETURNED" : null,
      settledAt: paidAt,
      returnReason: returnReason,
    });
  } catch (err) {
    console.error(`[refresh-payment-status] attempt update failed for ${paymentId}:`, err);
  }

  return { ok: true, status: newPaymentStatus, transferStatus: newTransferStatus };
}

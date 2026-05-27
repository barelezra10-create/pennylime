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
    select: { id: true, increaseTransferId: true, status: true },
  });
  if (!payment) return { ok: false, error: "Payment not found" };
  if (!payment.increaseTransferId) {
    return { ok: false, error: "No Increase transfer attached yet" };
  }

  const isRtp = payment.increaseTransferId.startsWith("real_time_payments_transfer_");
  const url = `https://api.increase.com${
    isRtp
      ? `/real_time_payments_transfers/${payment.increaseTransferId}`
      : `/ach_transfers/${payment.increaseTransferId}`
  }`;

  let data: { status?: string } | null = null;
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
    data = (await r.json()) as { status?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }

  const newTransferStatus = data?.status || "unknown";
  // Map Increase statuses to our Payment.status enum.
  // settled / complete -> PAID
  // returned / rejected -> RETURNED
  // submitted / pending_* -> stay PROCESSING (in flight)
  let newPaymentStatus = payment.status;
  let paidAt: Date | null = null;
  if (newTransferStatus === "settled" || newTransferStatus === "complete") {
    newPaymentStatus = "PAID";
    paidAt = new Date();
  } else if (newTransferStatus === "returned" || newTransferStatus === "rejected") {
    newPaymentStatus = "RETURNED";
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      increaseTransferStatus: newTransferStatus,
      ...(newPaymentStatus !== payment.status && { status: newPaymentStatus }),
      ...(paidAt && { paidAt }),
    },
  });

  return { ok: true, status: newPaymentStatus, transferStatus: newTransferStatus };
}

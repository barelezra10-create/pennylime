"use server";

import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";

/**
 * Borrower-portal-side sync of in-flight payment statuses against
 * Increase. Called by the portal's auto-refresh loop so a borrower
 * watching their dashboard sees PROCESSING -> PAID flip without
 * needing the webhook or the cron to fire.
 *
 * Scoped to the signed-in borrower's own application — never touches
 * any other borrower's data. Mirrors the polling logic in
 * /api/cron/payment-status but for a single borrower's PROCESSING
 * rows. Idempotent.
 */
export async function refreshMyPaymentStatus(): Promise<{
  ok: boolean;
  updated: number;
}> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, updated: 0 };

  const inflight = await prisma.payment.findMany({
    where: {
      applicationId,
      status: "PROCESSING",
      increaseTransferId: { not: null },
    },
    select: { id: true, increaseTransferId: true, paidAt: true, applicationId: true },
  });
  if (inflight.length === 0) return { ok: true, updated: 0 };

  const TERMINAL = ["settled", "complete", "returned", "rejected", "canceled"];
  const dirtyApplicationIds = new Set<string>();
  let updated = 0;

  for (const p of inflight) {
    if (!p.increaseTransferId) continue;
    const isRtp = p.increaseTransferId.startsWith("real_time_payments_transfer_");
    const url = `https://api.increase.com${
      isRtp
        ? `/real_time_payments_transfers/${p.increaseTransferId}`
        : `/ach_transfers/${p.increaseTransferId}`
    }`;
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
          "Increase-Version": "2024-04-15",
        },
      });
      if (!r.ok) continue;
      const data = (await r.json()) as { status?: string };
      const newStatus = data.status;
      if (!newStatus || !TERMINAL.includes(newStatus)) continue;

      const isSettled = newStatus === "settled" || newStatus === "complete";
      const isReturn = newStatus === "returned" || newStatus === "rejected";
      const nextPaymentStatus = isReturn ? "RETURNED" : isSettled ? "PAID" : "PROCESSING";

      await prisma.payment.update({
        where: { id: p.id },
        data: {
          increaseTransferStatus: newStatus,
          paidAt: isSettled && !p.paidAt ? new Date() : p.paidAt,
          status: nextPaymentStatus,
        },
      });
      updated++;
      if (isSettled || isReturn) dirtyApplicationIds.add(p.applicationId);
    } catch {
      // Silent — manual page reload is still a fallback.
    }
  }

  // Cascade to application status (FUNDED -> REPAYING -> PAID_OFF etc.)
  // so the dashboard pill flips at the same time the row does.
  if (dirtyApplicationIds.size > 0) {
    for (const appId of dirtyApplicationIds) {
      await refreshApplicationStatusFromPayments(appId);
    }
  }

  return { ok: true, updated };
}

async function refreshApplicationStatusFromPayments(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { payments: true },
  });
  if (!app) return;
  const ACTIVE = ["FUNDED", "REPAYING", "ACTIVE", "LATE"];
  if (!ACTIVE.includes(app.status)) return;

  const payments = app.payments;
  const obligated = payments.filter(
    (p) => p.status !== "WAIVED" && p.status !== "CANCELED" && p.status !== "RETURNED",
  );
  const allPaid = obligated.length > 0 && obligated.every((p) => p.status === "PAID");
  if (allPaid) {
    if (app.status !== "PAID_OFF") {
      await prisma.application.update({ where: { id: applicationId }, data: { status: "PAID_OFF" } });
    }
    return;
  }
  const now = new Date();
  const GRACE_DAYS = 1;
  const hasFailedPayment = payments.some((p) => p.status === "RETURNED" || p.status === "FAILED");
  const hasOverduePending = payments.some(
    (p) =>
      (p.status === "PENDING" || p.status === "PROCESSING") &&
      p.dueDate &&
      (now.getTime() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24) > GRACE_DAYS,
  );
  const hasPaidPayment = payments.some((p) => p.status === "PAID");
  let nextStatus: string = app.status;
  if (hasFailedPayment || hasOverduePending) nextStatus = "LATE";
  else if (hasPaidPayment) nextStatus = "REPAYING";
  else nextStatus = "FUNDED";
  if (nextStatus !== app.status) {
    await prisma.application.update({ where: { id: applicationId }, data: { status: nextStatus } });
  }
}

"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { explainReturnCode } from "@/lib/ach-return-codes";

type AuditRow = {
  applicationCode: string;
  borrowerName: string;
  paymentNumber: number;
  amount: number;
  before: string;
  liveStatus: string;
  after: string;
  reason: string | null;
};

/**
 * Cross-check every Payment row whose local status is FAILED / RETURNED
 * (or PROCESSING for completeness) against Increase's live transfer
 * status, then apply the corrected mapping:
 *
 *   settled / complete         -> PAID
 *   returned / rejected        -> RETURNED + reason code
 *   anything pending_*         -> PROCESSING  (self-heal stale RETURNED)
 *
 * Run from /admin (gated by next-auth session). Returns a per-payment
 * before/after table so admin can see exactly what changed.
 */
export async function auditStaleReturns(): Promise<
  | { ok: true; checked: number; updated: number; rows: AuditRow[] }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const candidates = await prisma.payment.findMany({
    where: {
      status: { in: ["FAILED", "RETURNED", "PROCESSING"] },
      increaseTransferId: { not: null },
    },
    include: {
      application: {
        select: { applicationCode: true, firstName: true, lastName: true, id: true },
      },
    },
  });

  const dirtyApplicationIds = new Set<string>();
  const rows: AuditRow[] = [];
  let updated = 0;

  for (const p of candidates) {
    if (!p.increaseTransferId) continue;
    const isRtp = p.increaseTransferId.startsWith("real_time_payments_transfer_");
    const url = `https://api.increase.com${
      isRtp
        ? `/real_time_payments_transfers/${p.increaseTransferId}`
        : `/ach_transfers/${p.increaseTransferId}`
    }`;
    let live: {
      status?: string;
      return?: { return_reason_code?: string };
      rejection?: { reject_reason_code?: string };
    } | null = null;
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
          "Increase-Version": "2024-04-15",
        },
      });
      if (!r.ok) continue;
      live = await r.json();
    } catch {
      continue;
    }

    const liveStatus = live?.status ?? "unknown";
    const isSettled = liveStatus === "settled" || liveStatus === "complete";
    const isReturn = liveStatus === "returned" || liveStatus === "rejected";

    let nextStatus = p.status;
    let nextReason: string | null = null;
    if (isSettled) nextStatus = "PAID";
    else if (isReturn) {
      nextStatus = "RETURNED";
      const code =
        live?.return?.return_reason_code ?? live?.rejection?.reject_reason_code ?? null;
      nextReason = explainReturnCode(code);
    } else if (p.status === "RETURNED" || p.status === "FAILED") {
      nextStatus = "PROCESSING";
      nextReason = null;
    }

    const changed =
      nextStatus !== p.status ||
      liveStatus !== p.increaseTransferStatus ||
      (nextReason !== null && nextReason !== p.increaseReturnReason);

    if (changed) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          increaseTransferStatus: liveStatus,
          status: nextStatus,
          paidAt: isSettled && !p.paidAt ? new Date() : p.paidAt,
          increaseReturnReason: isReturn
            ? nextReason
            : nextStatus === "PROCESSING"
            ? null
            : p.increaseReturnReason,
        },
      });
      updated++;
      if (nextStatus !== p.status) dirtyApplicationIds.add(p.application.id);
    }

    rows.push({
      applicationCode: p.application.applicationCode,
      borrowerName: `${p.application.firstName} ${p.application.lastName}`.trim(),
      paymentNumber: p.paymentNumber,
      amount: Number(p.amount) + Number(p.lateFee),
      before: p.status,
      liveStatus,
      after: nextStatus,
      reason: nextReason,
    });
  }

  return { ok: true, checked: candidates.length, updated, rows };
}

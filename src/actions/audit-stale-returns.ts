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

  // Pull every Payment with attempts on file — we want to re-check
  // EACH historical attempt's transferId against Increase, not just
  // the latest. A row that's currently PROCESSING on its newest
  // retry may have older attempts in our history that Increase
  // settled or returned ages ago; both views are useful for admin.
  const candidates = await prisma.payment.findMany({
    where: {
      OR: [
        { status: { in: ["FAILED", "RETURNED", "PROCESSING"] } },
        { attempts: { some: {} } },
      ],
    },
    include: {
      application: {
        select: { applicationCode: true, firstName: true, lastName: true, id: true },
      },
      attempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  const dirtyApplicationIds = new Set<string>();
  const rows: AuditRow[] = [];
  let updated = 0;
  const { updateAttemptStatus } = await import("@/lib/payment-attempts");

  async function pollIncrease(transferId: string) {
    const isRtp = transferId.startsWith("real_time_payments_transfer_");
    const url = `https://api.increase.com${
      isRtp
        ? `/real_time_payments_transfers/${transferId}`
        : `/ach_transfers/${transferId}`
    }`;
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
          "Increase-Version": "2024-04-15",
        },
      });
      if (!r.ok) return null;
      return (await r.json()) as {
        status?: string;
        return?: { return_reason_code?: string };
        rejection?: { reject_reason_code?: string };
      };
    } catch {
      return null;
    }
  }

  for (const p of candidates) {
    // Build the set of transfer ids we want to audit: every historical
    // attempt + the latest one on the Payment row itself (in case
    // attempts haven't been backfilled yet for an old payment).
    const attemptIds = (p.attempts ?? [])
      .map((a) => a.increaseTransferId)
      .filter((x): x is string => !!x);
    const allIds = new Set<string>(attemptIds);
    if (p.increaseTransferId) allIds.add(p.increaseTransferId);
    if (allIds.size === 0) continue;

    let latestLiveStatus = "—";
    let latestReason: string | null = null;
    let latestIsSettled = false;
    let latestIsReturn = false;

    // Refresh each attempt against Increase. The newest attempt's
    // result drives the Payment.status update; older attempts get
    // their attempt row updated so the history view is accurate but
    // never overrides the current Payment status.
    const sortedIds = [
      ...attemptIds,
      ...(p.increaseTransferId && !attemptIds.includes(p.increaseTransferId)
        ? [p.increaseTransferId]
        : []),
    ];

    for (let i = 0; i < sortedIds.length; i++) {
      const transferId = sortedIds[i];
      const live = await pollIncrease(transferId);
      if (!live) continue;
      const liveStatus = live.status ?? "unknown";
      const isSettled = liveStatus === "settled" || liveStatus === "complete";
      const isReturn = liveStatus === "returned" || liveStatus === "rejected";
      const code =
        live.return?.return_reason_code ?? live.rejection?.reject_reason_code ?? null;
      const reason = isReturn ? explainReturnCode(code) : null;

      await updateAttemptStatus({
        transferId,
        transferStatus: liveStatus,
        finalStatus: isSettled ? "PAID" : isReturn ? "RETURNED" : null,
        settledAt: isSettled ? new Date() : null,
        returnReason: reason,
      });

      if (i === sortedIds.length - 1) {
        // Newest attempt = source of truth for Payment.status
        latestLiveStatus = liveStatus;
        latestReason = reason;
        latestIsSettled = isSettled;
        latestIsReturn = isReturn;
      }
    }

    let nextStatus = p.status;
    let nextReason: string | null = null;
    if (latestIsSettled) nextStatus = "PAID";
    else if (latestIsReturn) {
      nextStatus = "RETURNED";
      nextReason = latestReason;
    } else if (p.status === "RETURNED" || p.status === "FAILED") {
      nextStatus = "PROCESSING";
      nextReason = null;
    }

    const changed =
      nextStatus !== p.status ||
      latestLiveStatus !== p.increaseTransferStatus ||
      (nextReason !== null && nextReason !== p.increaseReturnReason);

    if (changed) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          increaseTransferStatus: latestLiveStatus,
          status: nextStatus,
          paidAt: latestIsSettled && !p.paidAt ? new Date() : p.paidAt,
          increaseReturnReason: latestIsReturn
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
      liveStatus: latestLiveStatus,
      after: nextStatus,
      reason: nextReason,
    });
  }

  return { ok: true, checked: candidates.length, updated, rows };
}

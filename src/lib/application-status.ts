import { prisma } from "@/lib/db";

// Void rows (rolled-away originals, canceled, waived) don't count toward
// paid-off — the replacement payment carries the obligation instead.
const VOID_STATUSES = ["REPLACED", "CANCELED", "WAIVED"];
// Only recompute advances that have actually been disbursed.
const ACTIVE_STATUSES = ["FUNDED", "REPAYING", "ACTIVE", "LATE"];

/**
 * Recompute an advance's status from its payment ledger. Kept in one place so
 * the payment-status cron, the Increase webhook, and the NSF-roll sweep all
 * derive the same state:
 *   PAID_OFF  - every (non-void) payment PAID
 *   LATE      - any RETURNED/FAILED, or a still-PENDING payment past due
 *   REPAYING  - any payment PAID or rolled away (activity has happened)
 *   FUNDED    - disbursed but untouched
 *
 * A PROCESSING payment is in-flight at the processor (GoACH settles in ~9
 * days) so it does NOT count as overdue.
 */
export async function refreshApplicationStatus(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { payments: { select: { status: true, dueDate: true } } },
  });
  if (!app || !ACTIVE_STATUSES.includes(app.status)) return;

  const live = app.payments.filter((p) => !VOID_STATUSES.includes(p.status));
  const allPaid = live.length > 0 && live.every((p) => p.status === "PAID");
  if (allPaid) {
    if (app.status !== "PAID_OFF") {
      await prisma.application.update({ where: { id: applicationId }, data: { status: "PAID_OFF" } });
    }
    return;
  }

  const now = Date.now();
  const GRACE_DAYS = 1;
  const hasFailed = app.payments.some((p) => p.status === "RETURNED" || p.status === "FAILED");
  const overduePending = app.payments.some(
    (p) =>
      p.status === "PENDING" &&
      p.dueDate &&
      Math.floor((now - new Date(p.dueDate).getTime()) / 86400000) > GRACE_DAYS,
  );
  const hasPaid = app.payments.some((p) => p.status === "PAID");
  const hasRolled = app.payments.some((p) => p.status === "REPLACED");
  // A debit that's in-flight at the processor means repayment has started, so
  // the account is REPAYING, not FUNDED (which means "no debit attempted yet").
  const hasProcessing = app.payments.some((p) => p.status === "PROCESSING");

  const next =
    hasFailed || overduePending ? "LATE" : hasPaid || hasRolled || hasProcessing ? "REPAYING" : "FUNDED";
  if (next !== app.status) {
    await prisma.application.update({ where: { id: applicationId }, data: { status: next } });
  }
}

import "server-only";
import { prisma } from "@/lib/db";

// Borrowers must never be debited before the advance actually lands in their
// account. Disbursement can take up to 5 business days, so the first payment
// is held to at least this many CALENDAR days after the funding date.
const MIN_DAYS_AFTER_FUNDING = 7;

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function nextBusinessDay(d: Date): Date {
  let x = new Date(d);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}
// Next due date for the cadence: DAILY debits every business day, WEEKLY +7.
function advance(d: Date, daily: boolean): Date {
  if (!daily) return addDays(d, 7);
  let x = addDays(d, 1);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}

/**
 * Guarantee the borrower's first payment lands at least a week after funding.
 *
 * The repayment schedule is built at offer-acceptance (first debit ~5 business
 * days out). When funding happens later than acceptance (manual approve →
 * fund), that anchor drifts and the first debit could land before the money
 * arrives. This shifts the whole UNPAID schedule forward so the first payment
 * is >= fundedAt + 7 days, preserving cadence (DAILY = business days, WEEKLY
 * = weekly). No-op when the schedule already clears the buffer (e.g. same-day
 * auto-fund, where 5 business days already spans a full week).
 *
 * Call AFTER fundedAt is set.
 */
export async function enforceFirstPaymentBuffer(
  applicationId: string,
): Promise<{ shifted: boolean; firstDueDate: Date | null }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { fundedAt: true, paymentFrequency: true },
  });
  if (!app?.fundedAt) return { shifted: false, firstDueDate: null };

  const pending = await prisma.payment.findMany({
    where: { applicationId, paidAt: null, status: "PENDING" },
    orderBy: [{ dueDate: "asc" }, { paymentNumber: "asc" }],
    select: { id: true, dueDate: true },
  });
  if (pending.length === 0) return { shifted: false, firstDueDate: null };

  // Earliest allowed first debit: funded + 7 calendar days, snapped to a
  // business day, keeping the funding time-of-day so cron sees it the same way.
  const funded = app.fundedAt;
  const minFirst = nextBusinessDay(addDays(funded, MIN_DAYS_AFTER_FUNDING));
  minFirst.setUTCHours(
    funded.getUTCHours(),
    funded.getUTCMinutes(),
    funded.getUTCSeconds(),
    funded.getUTCMilliseconds(),
  );

  if (pending[0].dueDate.getTime() >= minFirst.getTime()) {
    return { shifted: false, firstDueDate: pending[0].dueDate };
  }

  const daily = app.paymentFrequency === "DAILY";
  let due = new Date(minFirst);
  const updates = pending.map((p) => {
    const dueDate = new Date(due);
    due = advance(due, daily);
    return { id: p.id, dueDate };
  });

  await prisma.$transaction(
    updates.map((u) => prisma.payment.update({ where: { id: u.id }, data: { dueDate: u.dueDate } })),
  );

  return { shifted: true, firstDueDate: updates[0].dueDate };
}

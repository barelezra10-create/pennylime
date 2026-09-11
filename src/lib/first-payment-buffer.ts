import "server-only";
import { prisma } from "@/lib/db";

// Borrowers must never be debited before the advance actually lands in their
// account. Disbursement can take up to 5 business days, so the first payment
// is held to at least this many CALENDAR days after the funding date.
const MIN_DAYS_AFTER_FUNDING = 7;

// TEMPORARY floor while GoACH holds new-originator deposits until ~the 22nd:
// no first debit before this date even when a per-advance deposit date wasn't
// captured. Self-expiring — once today is past it, funded+7 dominates and this
// has no effect. Bump or drop it once GoACH deposits settle on a normal T+1/2.
const EARLIEST_FIRST_PAYMENT = new Date("2026-09-23T00:00:00Z");

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
    select: { fundedAt: true, paymentFrequency: true, goachDepositDate: true },
  });
  if (!app?.fundedAt) return { shifted: false, firstDueDate: null };

  const pending = await prisma.payment.findMany({
    where: { applicationId, paidAt: null, status: "PENDING" },
    orderBy: [{ dueDate: "asc" }, { paymentNumber: "asc" }],
    select: { id: true, dueDate: true },
  });
  if (pending.length === 0) return { shifted: false, firstDueDate: null };

  const funded = app.fundedAt;
  const stamp = (d: Date) => {
    d.setUTCHours(
      funded.getUTCHours(),
      funded.getUTCMinutes(),
      funded.getUTCSeconds(),
      funded.getUTCMilliseconds(),
    );
    return d;
  };
  // Earliest allowed first debit: funded + 7 calendar days, snapped to a
  // business day, keeping the funding time-of-day so cron sees it the same way.
  let minFirst = stamp(nextBusinessDay(addDays(funded, MIN_DAYS_AFTER_FUNDING)));

  // Never debit before the advance actually lands. When GoACH reports the
  // disbursement's deposit/effective date, the first payment must fall on the
  // business day AFTER it — take whichever floor is later (the 7-day minimum or
  // the day after deposit), so a delayed deposit pushes the whole schedule out.
  if (app.goachDepositDate) {
    const afterDeposit = stamp(nextBusinessDay(addDays(app.goachDepositDate, 1)));
    if (afterDeposit.getTime() > minFirst.getTime()) minFirst = afterDeposit;
  }

  // Temporary global floor (see EARLIEST_FIRST_PAYMENT) — covers advances whose
  // deposit date GoACH hasn't reported yet during the current deposit hold.
  if (EARLIEST_FIRST_PAYMENT.getTime() > minFirst.getTime()) {
    minFirst = stamp(nextBusinessDay(new Date(EARLIEST_FIRST_PAYMENT)));
  }

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

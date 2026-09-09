/**
 * Chronological "next payment" selection.
 *
 * paymentNumber is NOT a reliable ordering key: the admin "Skip to end" /
 * "Push" controls and the borrower-portal skip all move a payment's
 * dueDate forward while deliberately keeping its paymentNumber stable.
 * After a skip, payment #1 can have the LATEST due date, so anything that
 * picks "the first PENDING by paymentNumber" wrongly treats the skipped
 * payment as next. The next payment is always the earliest-dued one.
 */

type Duable = { dueDate: Date | string };

/**
 * Return the chronologically-earliest payment by dueDate, or undefined for
 * an empty list. Ties are broken by original array order (stable — first
 * wins), which keeps same-day rows in their incoming paymentNumber order.
 */
export function earliestByDueDate<T extends Duable>(payments: T[]): T | undefined {
  let best: T | undefined;
  let bestTime = Infinity;
  for (const p of payments) {
    const t = new Date(p.dueDate).getTime();
    if (t < bestTime) {
      bestTime = t;
      best = p;
    }
  }
  return best;
}

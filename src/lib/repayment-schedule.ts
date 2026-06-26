// Repayment schedule generator, shared by the offer-acceptance path.
// Supports two cadences for the SAME total cost of capital:
//   WEEKLY — one debit per week (the original behavior).
//   DAILY  — one debit every business day (Mon-Fri), termWeeks * 5 debits.
// Pure + deterministic so the money-critical math is unit-tested.

export type PaymentFrequency = "WEEKLY" | "DAILY";

export interface ScheduleRow {
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
}

export interface ScheduleInput {
  principal: number;
  weeklyPayment: number;
  termWeeks: number;
  startDate: Date;
  frequency: PaymentFrequency;
  // Weekly only: snap the first (and every) debit to this weekday
  // (0=Sun … 6=Sat), inferred from the borrower's deposit pattern.
  preferredChargeDay?: number | null;
}

const FIRST_PAYMENT_BUFFER_DAYS = 3;
const BUSINESS_DAYS_PER_WEEK = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function nextBusinessDay(d: Date): Date {
  let x = addDays(d, 1);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}

/**
 * First-debit anchor. Leaves ACH disbursement time to clear
 * (FIRST_PAYMENT_BUFFER_DAYS), and for weekly snaps onto the borrower's
 * preferredChargeDay when we have one.
 */
function firstDueDate(input: ScheduleInput): Date {
  const start = new Date(input.startDate);
  if (input.frequency === "WEEKLY" && input.preferredChargeDay != null) {
    const targetDay = input.preferredChargeDay;
    let dayOffset = (targetDay - start.getDay() + 7) % 7;
    if (dayOffset < FIRST_PAYMENT_BUFFER_DAYS) dayOffset += 7;
    return addDays(start, dayOffset);
  }
  let due = addDays(start, FIRST_PAYMENT_BUFFER_DAYS);
  // Daily debits must land on a business day.
  if (input.frequency === "DAILY" && isWeekend(due)) due = nextBusinessDay(due);
  return due;
}

export function generateRepaymentSchedule(input: ScheduleInput): ScheduleRow[] {
  const totalToRepay = round2(input.weeklyPayment * input.termWeeks);
  const totalInterest = Math.max(0, round2(totalToRepay - input.principal));

  const count =
    input.frequency === "DAILY"
      ? input.termWeeks * BUSINESS_DAYS_PER_WEEK
      : input.termWeeks;
  if (count <= 0) return [];

  const perAmount = round2(totalToRepay / count);
  const perInterest = round2(totalInterest / count);

  const rows: ScheduleRow[] = [];
  let due = firstDueDate(input);
  let amountSoFar = 0;
  let interestSoFar = 0;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    // The final debit absorbs rounding so the schedule totals exactly.
    const amount = isLast ? round2(totalToRepay - amountSoFar) : perAmount;
    const interest = isLast ? round2(totalInterest - interestSoFar) : perInterest;
    rows.push({
      paymentNumber: i + 1,
      dueDate: new Date(due),
      amount,
      principal: round2(amount - interest),
      interest,
    });
    amountSoFar = round2(amountSoFar + amount);
    interestSoFar = round2(interestSoFar + interest);

    if (!isLast) {
      due =
        input.frequency === "DAILY"
          ? nextBusinessDay(due)
          : addDays(due, 7);
    }
  }

  return rows;
}

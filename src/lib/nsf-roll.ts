// NSF roll-to-end math. Pure + deterministic so the money-critical logic is
// unit-tested. When a payment returns NSF we append a replacement payment at
// the END of the schedule (plus a separate late-fee charge), extending the
// plan by one period. After MAX_ROLLS unsuccessful rolls the advance escalates
// to Collections instead of rolling again.

export type Frequency = "WEEKLY" | "DAILY";

export const MAX_ROLLS = 3;
export const DEFAULT_LATE_FEE = 25;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Next debit slot after `from`: +7d weekly, next business day for daily. */
export function nextDueDate(from: Date, frequency: Frequency): Date {
  if (frequency === "DAILY") {
    let x = addDays(from, 1);
    while (isWeekend(x)) x = addDays(x, 1);
    return x;
  }
  return addDays(from, 7);
}

export interface RollPaymentInput {
  id: string;
  amount: number;
  principal: number;
  interest: number;
  collectedAmount: number;
  rollCount: number;
  isLateFee: boolean;
}

export interface SchedulePaymentInput {
  paymentNumber: number;
  dueDate: Date;
}

export interface NewPaymentSpec {
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
  isLateFee: boolean;
  rollCount: number;
  rolledFromPaymentId: string;
}

export type RollPlan =
  | { action: "collections"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "roll"; replacement: NewPaymentSpec; lateFee: NewPaymentSpec | null };

export interface ComputeRollInput {
  failed: RollPaymentInput;
  allPayments: SchedulePaymentInput[];
  frequency: Frequency;
  lateFeeAmount?: number;
  maxRolls?: number;
}

/**
 * Decide what to do with a returned/NSF payment:
 *  - a late-fee charge that itself fails is never rolled (skip)
 *  - once it has already been rolled maxRolls times, escalate to Collections
 *  - otherwise, produce the replacement (for the still-outstanding balance)
 *    appended at the end, plus a separate late-fee charge one slot later.
 */
export function computeRollPlan(input: ComputeRollInput): RollPlan {
  const { failed, allPayments, frequency } = input;
  const lateFeeAmount = input.lateFeeAmount ?? DEFAULT_LATE_FEE;
  const maxRolls = input.maxRolls ?? MAX_ROLLS;

  if (failed.isLateFee) {
    return { action: "skip", reason: "Late-fee charges are not rolled." };
  }
  if (failed.rollCount >= maxRolls) {
    return {
      action: "collections",
      reason: `Payment rolled ${failed.rollCount} time(s) without clearing; escalating to Collections.`,
    };
  }

  const maxNumber = allPayments.reduce((m, p) => Math.max(m, p.paymentNumber), 0);
  const lastDue = allPayments.reduce(
    (m, p) => (p.dueDate.getTime() > m.getTime() ? p.dueDate : m),
    allPayments[0]?.dueDate ?? new Date(),
  );

  // Only re-schedule what is still outstanding (handles partial micro-collections).
  const outstanding = round2(Math.max(0, failed.amount - failed.collectedAmount));
  const ratio = failed.amount > 0 ? outstanding / failed.amount : 1;

  const replDue = nextDueDate(lastDue, frequency);
  const replacement: NewPaymentSpec = {
    paymentNumber: maxNumber + 1,
    dueDate: replDue,
    amount: outstanding,
    principal: round2(failed.principal * ratio),
    interest: round2(failed.interest * ratio),
    isLateFee: false,
    rollCount: failed.rollCount + 1,
    rolledFromPaymentId: failed.id,
  };

  const lateFee: NewPaymentSpec | null =
    lateFeeAmount > 0
      ? {
          paymentNumber: maxNumber + 2,
          dueDate: nextDueDate(replDue, frequency),
          amount: round2(lateFeeAmount),
          principal: 0,
          interest: 0,
          isLateFee: true,
          rollCount: 0,
          rolledFromPaymentId: failed.id,
        }
      : null;

  return { action: "roll", replacement, lateFee };
}

import { easternDateString, easternDayDiff } from "@/lib/eastern-time";

export type SettlementTerms = {
  total: number;
  count: number;
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  firstDate: string;
};
export type SettlementPayment = {
  id: string;
  status: string;
  amount: number;
  principal: number;
  lateFee: number;
  collectedAmount: number;
  dueDate: Date;
  supersededBySettlementId?: string | null;
};
export const OPEN_PAYMENT_STATUSES = [
  "PENDING",
  "FAILED",
  "LATE",
  "RETURNED",
  "COLLECTIONS",
];
export const COLLECTION_ACCOUNT_STATUSES = [
  "FUNDED",
  "ACTIVE",
  "REPAYING",
  "LATE",
  "COLLECTIONS",
  "DEFAULTED",
];
const cents = (n: number) => Math.round(n * 100);

export function paymentOutstanding(p: SettlementPayment) {
  if (p.supersededBySettlementId || !OPEN_PAYMENT_STATUSES.includes(p.status))
    return 0;
  return (
    Math.max(0, cents(p.amount) + cents(p.lateFee) - cents(p.collectedAmount)) /
    100
  );
}

export function collectionBalance(
  payments: SettlementPayment[],
  now = new Date(),
) {
  const open = payments.filter((p) => paymentOutstanding(p) > 0);
  const overdue = open.filter((p) => easternDayDiff(now, p.dueDate) > 0);
  return {
    outstanding:
      open.reduce((s, p) => s + cents(paymentOutstanding(p)), 0) / 100,
    overdue:
      overdue.reduce((s, p) => s + cents(paymentOutstanding(p)), 0) / 100,
    missedCount: overdue.length,
    daysOverdue: Math.max(
      0,
      ...overdue.map((p) => easternDayDiff(now, p.dueDate)),
    ),
    processing: payments.some(
      (p) => p.status === "PROCESSING" && !p.supersededBySettlementId,
    ),
  };
}

/** Stable financial snapshot: any schedule change requires a fresh offer. */
export function settlementSnapshot(payments: SettlementPayment[]) {
  return JSON.stringify(
    [...payments]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        status: p.status,
        amount: cents(p.amount),
        principal: cents(p.principal),
        fee: cents(p.lateFee),
        collected: cents(p.collectedAmount),
        date: p.dueDate.toISOString(),
        superseded: p.supersededBySettlementId ?? null,
      })),
  );
}

export function buildSettlementPlan(terms: SettlementTerms, now = new Date()) {
  if (
    !Number.isFinite(terms.total) ||
    terms.total <= 0 ||
    terms.total > 100000 ||
    Math.abs(terms.total * 100 - cents(terms.total)) > 0.00001
  )
    throw new Error(
      "Enter a settlement total between $0.01 and $100,000, with at most two decimal places.",
    );
  if (
    !Number.isInteger(terms.count) ||
    terms.count < 1 ||
    terms.count > 120 ||
    terms.count > cents(terms.total)
  )
    throw new Error("Choose 1–120 installments, each at least $0.01.");
  if (!["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"].includes(terms.frequency))
    throw new Error("Choose a payment frequency.");
  const first = new Date(`${terms.firstDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(terms.firstDate) ||
    !Number.isFinite(first.getTime()) ||
    first.toISOString().slice(0, 10) !== terms.firstDate ||
    terms.firstDate <= easternDateString(now)
  )
    throw new Error("The first payment must be a valid future date.");
  if ([0, 6].includes(first.getUTCDay()))
    throw new Error("Choose a weekday for the first payment.");
  const base = Math.floor(cents(terms.total) / terms.count);
  return Array.from({ length: terms.count }, (_, i) => {
    const due = new Date(first);
    if (terms.frequency === "DAILY") {
      for (let n = 0; n < i; n++) {
        due.setUTCDate(due.getUTCDate() + 1);
        while ([0, 6].includes(due.getUTCDay())) due.setUTCDate(due.getUTCDate() + 1);
      }
    } else if (terms.frequency === "MONTHLY") {
      due.setUTCDate(1);
      due.setUTCMonth(first.getUTCMonth() + i);
      const last = new Date(
        Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0),
      ).getUTCDate();
      due.setUTCDate(Math.min(first.getUTCDate(), last));
    } else
      due.setUTCDate(
        due.getUTCDate() + i * (terms.frequency === "WEEKLY" ? 7 : 14),
      );
    while ([0, 6].includes(due.getUTCDay()))
      due.setUTCDate(due.getUTCDate() + 1);
    return {
      date: due.toISOString().slice(0, 10),
      amount:
        (i === terms.count - 1 ? cents(terms.total) - base * i : base) / 100,
    };
  });
}

export function settlementAchText(total: number, count: number) {
  return `I authorize PennyLime (770 Technology LLC) to ACH debit my linked bank account for the ${count} settlement payment${count === 1 ? "" : "s"} listed above, totaling $${total.toFixed(2)}. This replaces the prior unpaid payment schedule for this advance when I sign. This authorization remains in effect until the settlement amount has been delivered or I revoke in writing by emailing info@pennylime.com at least 3 business days before the next debit.`;
}

// Pure selector: which schedule rows count as "missed" for collection UIs.

export type PaymentForSelector = {
  id: string;
  paymentNumber: number;
  amount: number;
  lateFee: number;
  collectedAmount: number;
  dueDate: Date;
  status: string;
  increaseReturnReason: string | null;
};

export type MissedPayment = {
  paymentId: string;
  paymentNumber: number;
  amount: number;
  lateFee: number;
  collectedAmount: number;
  outstanding: number;
  dueDate: Date;
  status: string;
  returnReason: string | null;
};

const MISSED_STATUSES = new Set(["FAILED", "LATE", "RETURNED", "COLLECTIONS"]);

export function selectMissedPayments(payments: PaymentForSelector[], now: Date): MissedPayment[] {
  return payments
    .filter(
      (p) =>
        MISSED_STATUSES.has(p.status) ||
        (p.status === "PENDING" && p.dueDate.getTime() < now.getTime())
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((p) => ({
      paymentId: p.id,
      paymentNumber: p.paymentNumber,
      amount: p.amount,
      lateFee: p.lateFee,
      collectedAmount: p.collectedAmount,
      outstanding: Math.round((Math.max(0, p.amount - p.collectedAmount) + p.lateFee) * 100) / 100,
      dueDate: p.dueDate,
      status: p.status,
      returnReason: p.increaseReturnReason,
    }));
}

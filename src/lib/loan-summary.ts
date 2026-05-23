export type PaymentLite = {
  id: string;
  amount: number | string;
  principal?: number | string;
  interest?: number | string;
  lateFee?: number | string;
  dueDate: Date | string;
  paidAt: Date | string | null;
  status: string;
  paymentNumber: number;
};

export type ApplicationLite = {
  loanAmount: number | string;
  loanTermMonths?: number | null;
  fundedAmount?: number | string | null;
  fundedAt?: Date | string | null;
  status: string;
  offerStatus?: string | null;
  payments?: PaymentLite[];
};

export type LoanSummary = {
  hasLoan: boolean;
  loanAmount: number;
  fundedAmount: number;
  totalPayments: number;
  paidPayments: number;
  remainingPayments: number;
  paidAmount: number;
  remainingAmount: number;
  perPaymentAmount: number;
  cadence: "weekly" | "biweekly" | "monthly" | "unknown";
  nextDue: { date: string; amount: number; status: string } | null;
  isLate: boolean;
  isComplete: boolean;
  progressPct: number;
  // Application + offer status so contact/dashboard surfaces can render
  // the shared StatusBadge without re-fetching the application row.
  applicationStatus: string;
  offerStatus: string | null;
};

const num = (v: number | string | null | undefined) => (v == null ? 0 : typeof v === "number" ? v : Number(v));
const dateOf = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

export function computeLoanSummary(app: ApplicationLite | null | undefined): LoanSummary {
  if (!app) {
    return {
      hasLoan: false,
      loanAmount: 0,
      fundedAmount: 0,
      totalPayments: 0,
      paidPayments: 0,
      remainingPayments: 0,
      paidAmount: 0,
      remainingAmount: 0,
      perPaymentAmount: 0,
      cadence: "unknown",
      nextDue: null,
      isLate: false,
      isComplete: false,
      progressPct: 0,
      applicationStatus: "",
      offerStatus: null,
    };
  }

  const payments = app.payments || [];
  const total = payments.length;
  const paid = payments.filter((p) => p.status === "PAID" || p.paidAt);
  const paidCount = paid.length;
  const paidAmount = paid.reduce((sum, p) => sum + num(p.amount), 0);
  const totalScheduled = payments.reduce((sum, p) => sum + num(p.amount), 0);
  const loanAmount = num(app.loanAmount);
  const fundedAmount = num(app.fundedAmount) || loanAmount;
  const remainingAmount = Math.max(totalScheduled - paidAmount, 0);

  // First unpaid payment is the "next due"
  const nextUnpaid = payments.find((p) => p.status !== "PAID" && !p.paidAt);
  const now = Date.now();
  const isLate = nextUnpaid ? new Date(nextUnpaid.dueDate).getTime() < now : false;

  // Cadence detection from payment date gaps
  let cadence: LoanSummary["cadence"] = "unknown";
  if (payments.length >= 2) {
    const sorted = [...payments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const days = (new Date(sorted[1].dueDate).getTime() - new Date(sorted[0].dueDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 10) cadence = "weekly";
    else if (days < 20) cadence = "biweekly";
    else cadence = "monthly";
  }

  const perPaymentAmount = total > 0 ? num(payments[0].amount) : 0;
  const progressPct = total > 0 ? Math.round((paidCount / total) * 100) : 0;

  return {
    hasLoan: true,
    loanAmount,
    fundedAmount,
    totalPayments: total,
    paidPayments: paidCount,
    remainingPayments: Math.max(total - paidCount, 0),
    paidAmount,
    remainingAmount,
    perPaymentAmount,
    cadence,
    nextDue: nextUnpaid
      ? {
          date: dateOf(nextUnpaid.dueDate)!.toISOString(),
          amount: num(nextUnpaid.amount),
          status: nextUnpaid.status,
        }
      : null,
    isLate,
    isComplete: paidCount === total && total > 0,
    progressPct,
    applicationStatus: app.status,
    offerStatus: app.offerStatus ?? null,
  };
}

export function fmtMoney(n: number | string | null | undefined, opts?: { decimals?: number }) {
  const v = num(n);
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: opts?.decimals ?? 0,
    maximumFractionDigits: opts?.decimals ?? 0,
  })}`;
}

export function cadenceLabel(c: LoanSummary["cadence"]) {
  switch (c) {
    case "weekly":
      return "/wk";
    case "biweekly":
      return "/2wk";
    case "monthly":
      return "/mo";
    default:
      return "";
  }
}

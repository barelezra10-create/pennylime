"use server";

import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { chargePaymentNow } from "@/actions/payments";

const num = (v: number | string | { toString(): string } | null | undefined) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
};

const LIVE_STATUSES = ["ACTIVE", "FUNDED", "REPAYING", "LATE", "COLLECTIONS"];

// The `source` field on Contact is almost always "direct" (a default); the
// real acquisition channel is in the referrer URL. Map it to a clean name.
function friendlySource(referrer: string | null, source: string | null): string {
  const r = (referrer || "").toLowerCase();
  if (r.includes("chatgpt") || r.includes("openai")) return "ChatGPT";
  if (r.includes("google")) return "Google";
  if (r.includes("bing")) return "Bing";
  if (r.includes("duckduckgo")) return "DuckDuckGo";
  if (r.includes("facebook") || r.includes("fb.")) return "Facebook";
  if (r.includes("instagram")) return "Instagram";
  if (r.includes("tiktok")) return "TikTok";
  if (r.includes("reddit")) return "Reddit";
  if (r.includes("teams") || r.includes("office")) return "Microsoft Teams";
  if (r.includes("pennylime.com")) return "Direct"; // internal nav / returning
  if (referrer) {
    try { return new URL(referrer).hostname.replace(/^www\./, ""); } catch { return referrer; }
  }
  if (source && source.toLowerCase() !== "direct") return source;
  return "Direct";
}

const STAGE_OF: Record<string, string> = {
  PENDING: "Pending",
  APPLICANT: "Pending",
  APPROVED: "Approved",
  OFFER_ACCEPTED: "Approved",
  FUNDED: "Active",
  ACTIVE: "Active",
  REPAYING: "Active",
  LATE: "Active",
  COLLECTIONS: "Default",
  DEFAULTED: "Default",
  PAID_OFF: "Paid",
  REJECTED: "Rejected",
};

export type AdvanceRow = {
  id: string;
  applicationCode: string;
  borrowerName: string;
  status: string;
  stageTab: string;
  platform: string | null;
  termMonths: number;
  monthlyIncome: number | null;
  bankBalance: number | null;
  referral: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  fundedAmount: number;
  nextPaymentId: string | null;
  nextDueDate: string | null;
  nextDueAmount: number;
  outstanding: number;
  paidToDate: number;
  daysOverdue: number; // 0 if not overdue
  isProcessing: boolean; // a payment is mid-flight
  lastResult: string | null; // last settled/attempted payment status
};

export type AdvancesSummary = {
  totalAdvances: number;
  dueTodayCount: number;
  dueTodayAmount: number;
  overdueCount: number;
  overdueAmount: number;
  totalOutstanding: number;
  collected7dAmount: number;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getAdvances(): Promise<{ advances: AdvanceRow[]; summary: AdvancesSummary }> {
  const apps = await prisma.application.findMany({
    where: { status: { in: Object.keys(STAGE_OF) } },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      lastName: true,
      status: true,
      fundedAmount: true,
      loanAmount: true,
      platform: true,
      loanTermMonths: true,
      monthlyIncome: true,
      bankBalance: true,
      offeredMaxAmount: true,
      contact: { select: { source: true, referrer: true } },
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          lateFee: true,
          status: true,
          dueDate: true,
          paidAt: true,
        },
      },
    },
  });

  const today0 = startOfToday();
  const todayEnd = endOfToday();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let dueTodayCount = 0;
  let dueTodayAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let totalOutstanding = 0;
  let collected7dAmount = 0;

  const advances: AdvanceRow[] = apps.map((app) => {
    const unpaid = app.payments.filter((p) => p.status !== "PAID" && !p.paidAt);
    const outstanding = unpaid.reduce((s, p) => s + num(p.amount) + num(p.lateFee), 0);
    const paidToDate = app.payments
      .filter((p) => p.status === "PAID" || p.paidAt)
      .reduce((s, p) => s + num(p.amount) + num(p.lateFee), 0);

    const nextPending = app.payments.find((p) => p.status === "PENDING");
    const isProcessing = app.payments.some((p) => p.status === "PROCESSING");

    // Days overdue based on the oldest still-pending payment past its due date.
    const oldestPending = app.payments.find((p) => p.status === "PENDING");
    let daysOverdue = 0;
    if (oldestPending && new Date(oldestPending.dueDate) < today0) {
      daysOverdue = Math.floor((today0.getTime() - new Date(oldestPending.dueDate).getTime()) / 86400000);
    }

    // Last result: most recent payment that was attempted (paid/failed/processing).
    const attempted = app.payments
      .filter((p) => p.status !== "PENDING")
      .sort((a, b) => b.paymentNumber - a.paymentNumber);
    const lastResult = attempted[0]?.status ?? null;

    const isFunded = LIVE_STATUSES.includes(app.status);

    // Roll up the summary metrics — funded rows only.
    if (isFunded) {
      for (const p of app.payments) {
        if (p.status === "PENDING") {
          const due = new Date(p.dueDate);
          if (due <= todayEnd) {
            dueTodayCount += 1;
            dueTodayAmount += num(p.amount) + num(p.lateFee);
            if (due < today0) {
              overdueCount += 1;
              overdueAmount += num(p.amount) + num(p.lateFee);
            }
          }
        }
        if ((p.status === "PAID" || p.paidAt) && p.paidAt && new Date(p.paidAt) >= weekAgo) {
          collected7dAmount += num(p.amount) + num(p.lateFee);
        }
      }
      totalOutstanding += outstanding;
    }

    return {
      id: app.id,
      applicationCode: app.applicationCode,
      borrowerName: `${app.firstName} ${app.lastName}`.trim(),
      status: app.status,
      stageTab: STAGE_OF[app.status] ?? "Active",
      platform: app.platform ?? null,
      termMonths: app.loanTermMonths,
      monthlyIncome: app.monthlyIncome != null ? num(app.monthlyIncome) : null,
      bankBalance: app.bankBalance != null ? num(app.bankBalance) : null,
      referral: friendlySource(app.contact?.referrer ?? null, app.contact?.source ?? null),
      requestedAmount: num(app.loanAmount),
      approvedAmount: app.offeredMaxAmount != null ? num(app.offeredMaxAmount) : null,
      fundedAmount: num(app.fundedAmount) || num(app.loanAmount),
      nextPaymentId: nextPending?.id ?? null,
      nextDueDate: nextPending ? new Date(nextPending.dueDate).toISOString() : null,
      nextDueAmount: nextPending ? num(nextPending.amount) + num(nextPending.lateFee) : 0,
      outstanding,
      paidToDate,
      daysOverdue,
      isProcessing,
      lastResult,
    };
  });

  // Sort: most overdue first, then due soonest, then most owed.
  advances.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    const ad = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
    const bd = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return b.outstanding - a.outstanding;
  });

  return {
    advances,
    summary: {
      totalAdvances: advances.length,
      dueTodayCount,
      dueTodayAmount,
      overdueCount,
      overdueAmount,
      totalOutstanding,
      collected7dAmount,
    },
  };
}

/**
 * Charge every PENDING payment due today or earlier across all live advances,
 * in one action. Same money-safe path as the single "Charge now" button
 * (chargePaymentNow locks each row to PROCESSING then debits via GoACH),
 * so it can't double-charge a row the cron is also working.
 */
export async function chargeAllDueToday(): Promise<{ ok: boolean; charged: number; failed: number; error?: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, charged: 0, failed: 0, error: auth.error };

  const due = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: endOfToday() },
      application: { status: { in: LIVE_STATUSES } },
    },
    select: { id: true },
  });

  let charged = 0;
  let failed = 0;
  for (const p of due) {
    try {
      const r = await chargePaymentNow(p.id);
      if (r.success) charged += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok: true, charged, failed };
}

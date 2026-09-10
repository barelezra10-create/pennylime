"use server";

import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { chargePaymentNow } from "@/actions/payments";
import { earliestByDueDate } from "@/lib/next-payment";

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
  UNQUALIFIED: "Unqualified",
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
  unqualifiedReason: string | null; // why the applicant was marked UNQUALIFIED
  bankBalance: number | null;
  referral: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  fundedAmount: number;
  appliedAt: string;
  nextPaymentId: string | null;
  nextDueDate: string | null;
  nextDueAmount: number;
  outstanding: number;
  paidToDate: number;
  daysOverdue: number; // 0 if not overdue
  isProcessing: boolean; // a payment is mid-flight
  lastResult: string | null; // last settled/attempted payment status
  paidCount: number; // payments paid
  totalCount: number; // total scheduled payments
  schedule: { n: number; amount: number; dueDate: string; status: string; paidAt: string | null }[];
  newEmailCount: number; // unread inbound emails from this applicant — "they replied"
  awaitingReply: boolean; // we emailed them and are waiting on a reply
  // Per-advance money figures so the dashboard cards can be scoped to the
  // current stage tab (sum these over the filtered rows).
  moneyOut: number; // principal still out on this advance
  profit: number; // realized profit (paid-off advances only)
  potentialProfit: number; // scheduled interest still to collect
  dueTodayAmount: number;
  dueTodayCount: number;
  overdueCount: number;
  // A pending portal "top-up" request surfaced into the Pending queue as its
  // own row (the borrower asking for more on an already-funded advance). These
  // are AdvanceTopUpRequest rows, not Applications, so they carry the source
  // application id + contact for the "Review top-up" link.
  isTopUp?: boolean;
  topUpRequestId?: string;
  topUpApplicationId?: string;
  topUpContactId?: string | null;
  // Signed the offer (offerStatus ACCEPTED) but still APPROVED — the ACH
  // disbursement never completed, so they're stranded on the Approved tab.
  fundingFailed?: boolean;
  disburseError?: string | null;
};

export type AdvancesSummary = {
  totalAdvances: number;
  dueTodayCount: number;
  dueTodayAmount: number;
  overdueCount: number;
  overdueAmount: number;
  totalOutstanding: number;
  collected7dAmount: number;
  moneyOut: number; // principal still out on funded advances
  paidBack: number; // total cash collected on funded advances
  profit: number; // realized interest + fees, only from advances paid in full
  potentialProfit: number; // expected interest on active advances if paid in full
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
      workVerificationJson: true,
      bankBalance: true,
      offeredMaxAmount: true,
      offerStatus: true,
      increaseDisburseError: true,
      createdAt: true,
      contact: { select: { id: true, source: true, referrer: true, awaitingReplySince: true } },
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          principal: true,
          interest: true,
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
  let moneyOut = 0;
  let paidBack = 0;
  let profit = 0; // realized: only from advances paid back in full
  let potentialProfit = 0; // expected interest on active advances if paid in full

  // Unread inbound emails per applicant, so the list can flag "they replied /
  // sent something new" (e.g. an applicant answering a docs request).
  const contactIds = apps.map((a) => a.contact?.id).filter((v): v is string => Boolean(v));
  const unreadByContact = new Map<string, number>();
  if (contactIds.length) {
    const grouped = await prisma.inboundEmail.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, status: "UNREAD" },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.contactId) unreadByContact.set(g.contactId, g._count._all);
    }
  }

  const advances: AdvanceRow[] = apps.map((app) => {
    // Void rows never count toward the balance: REPLACED (rolled-away originals,
    // the replacement carries the obligation), CANCELED (voided, e.g. a reversed
    // payoff), and WAIVED (collapsed into a payoff). Counting them double-billed
    // accounts (seen: a canceled roll + late fee inflating outstanding).
    const VOID_STATUSES = ["REPLACED", "CANCELED", "WAIVED"];
    const livePayments = app.payments.filter((p) => !VOID_STATUSES.includes(p.status));
    const unpaid = livePayments.filter((p) => p.status !== "PAID" && !p.paidAt);
    const outstanding = unpaid.reduce((s, p) => s + num(p.amount) + num(p.lateFee), 0);
    const paidPayments = livePayments.filter((p) => p.status === "PAID" || p.paidAt);
    const paidToDate = paidPayments.reduce((s, p) => s + num(p.amount) + num(p.lateFee), 0);
    const paidPrincipal = paidPayments.reduce((s, p) => s + num(p.principal), 0);
    const paidInterest = paidPayments.reduce((s, p) => s + num(p.interest) + num(p.lateFee), 0);
    const scheduledInterest = livePayments.reduce((s, p) => s + num(p.interest) + num(p.lateFee), 0);
    const paidCount = paidPayments.length;
    const totalCount = livePayments.length;

    // Earliest-dued pending, not first-by-paymentNumber: a skipped/pushed
    // payment keeps its number but moves in time (see earliestByDueDate).
    const nextPending = earliestByDueDate(app.payments.filter((p) => p.status === "PENDING"));
    const isProcessing = app.payments.some((p) => p.status === "PROCESSING");

    // Days overdue based on the oldest still-pending payment past its due date.
    const oldestPending = earliestByDueDate(app.payments.filter((p) => p.status === "PENDING"));
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
      moneyOut += Math.max((num(app.fundedAmount) || num(app.loanAmount)) - paidPrincipal, 0);
      paidBack += paidToDate;
      potentialProfit += scheduledInterest;
    }
    // Realized profit is only booked once the advance is fully paid off.
    if (app.status === "PAID_OFF") {
      profit += paidInterest;
    }

    // Per-advance figures for tab-scoped dashboard cards. Cover defaulted +
    // paid-off too so the Default and Paid tabs aren't understated.
    const isDefaulted = app.status === "DEFAULTED";
    const isPaidOff = app.status === "PAID_OFF";
    const rowDisbursed = isFunded || isDefaulted || isPaidOff;
    let rowDueTodayCount = 0;
    let rowDueTodayAmount = 0;
    let rowOverdueCount = 0;
    if (isFunded || isDefaulted) {
      for (const p of app.payments) {
        if (p.status === "PENDING") {
          const due = new Date(p.dueDate);
          if (due <= todayEnd) {
            rowDueTodayCount += 1;
            rowDueTodayAmount += num(p.amount) + num(p.lateFee);
            if (due < today0) rowOverdueCount += 1;
          }
        }
      }
    }
    const rowMoneyOut = rowDisbursed ? Math.max((num(app.fundedAmount) || num(app.loanAmount)) - paidPrincipal, 0) : 0;
    const rowProfit = isPaidOff ? paidInterest : 0;
    const rowPotentialProfit = isFunded ? scheduledInterest : 0;

    return {
      id: app.id,
      applicationCode: app.applicationCode,
      borrowerName: `${app.firstName} ${app.lastName}`.trim(),
      status: app.status,
      stageTab: STAGE_OF[app.status] ?? "Active",
      platform: app.platform ?? null,
      termMonths: app.loanTermMonths,
      monthlyIncome: app.monthlyIncome != null ? num(app.monthlyIncome) : null,
      unqualifiedReason: (() => {
        if (app.status !== "UNQUALIFIED" || !(app as any).workVerificationJson) return null;
        try {
          return JSON.parse((app as any).workVerificationJson).reason ?? null;
        } catch {
          return null;
        }
      })(),
      bankBalance: app.bankBalance != null ? num(app.bankBalance) : null,
      referral: friendlySource(app.contact?.referrer ?? null, app.contact?.source ?? null),
      requestedAmount: num(app.loanAmount),
      approvedAmount: app.offeredMaxAmount != null ? num(app.offeredMaxAmount) : null,
      fundedAmount: num(app.fundedAmount) || num(app.loanAmount),
      appliedAt: new Date(app.createdAt).toISOString(),
      nextPaymentId: nextPending?.id ?? null,
      nextDueDate: nextPending ? new Date(nextPending.dueDate).toISOString() : null,
      nextDueAmount: nextPending ? num(nextPending.amount) + num(nextPending.lateFee) : 0,
      outstanding,
      paidToDate,
      daysOverdue,
      isProcessing,
      lastResult,
      paidCount,
      totalCount,
      // Ordered by dueDate (paymentNumber tiebreak) so a skipped/pushed row
      // shows in its real chronological slot, matching the detail-page card.
      schedule: [...app.payments]
        .sort((x, y) =>
          new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime() ||
          x.paymentNumber - y.paymentNumber,
        )
        .map((p) => ({
          n: p.paymentNumber,
          amount: num(p.amount) + num(p.lateFee),
          dueDate: new Date(p.dueDate).toISOString(),
          status: p.status,
          paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
        })),
      newEmailCount: app.contact?.id ? unreadByContact.get(app.contact.id) ?? 0 : 0,
      awaitingReply:
        !!app.contact?.awaitingReplySince &&
        (app.contact?.id ? unreadByContact.get(app.contact.id) ?? 0 : 0) === 0,
      moneyOut: rowMoneyOut,
      profit: rowProfit,
      potentialProfit: rowPotentialProfit,
      dueTodayAmount: rowDueTodayAmount,
      dueTodayCount: rowDueTodayCount,
      overdueCount: rowOverdueCount,
      // Signed but not funded: offer accepted yet status is still APPROVED.
      fundingFailed: app.status === "APPROVED" && app.offerStatus === "ACCEPTED",
      disburseError: app.increaseDisburseError ?? null,
    };
  });

  // Surface pending portal top-up requests as their own rows in the Pending
  // queue. The borrower's underlying advance still shows on its own stage tab
  // (Active/etc); this is the "give me more" ask awaiting a decision, so it
  // belongs in Pending alongside new applications — just flagged as a top-up.
  const pendingTopUps = await prisma.advanceTopUpRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, requestedAmount: true, createdAt: true, contactId: true, applicationId: true },
  });
  // AdvanceTopUpRequest has no Application relation (scalar applicationId only),
  // so pull the source applications in one query and index them by id.
  const topUpAppById = new Map<string, {
    id: string; applicationCode: string; firstName: string; lastName: string;
    platform: string | null; monthlyIncome: unknown; bankBalance: unknown; loanTermMonths: number;
    contact: { id: string; source: string | null; referrer: string | null } | null;
  }>();
  if (pendingTopUps.length) {
    const srcApps = await prisma.application.findMany({
      where: { id: { in: pendingTopUps.map((t) => t.applicationId) } },
      select: {
        id: true, applicationCode: true, firstName: true, lastName: true,
        platform: true, monthlyIncome: true, bankBalance: true, loanTermMonths: true,
        contact: { select: { id: true, source: true, referrer: true } },
      },
    });
    for (const a of srcApps) topUpAppById.set(a.id, a);
  }
  for (const t of pendingTopUps) {
    const app = topUpAppById.get(t.applicationId);
    if (!app) continue;
    advances.push({
      id: `topup-${t.id}`,
      applicationCode: app.applicationCode,
      borrowerName: `${app.firstName} ${app.lastName}`.trim(),
      status: "PENDING",
      stageTab: "Pending",
      platform: app.platform ?? null,
      termMonths: app.loanTermMonths,
      monthlyIncome: app.monthlyIncome != null ? num(app.monthlyIncome) : null,
      unqualifiedReason: null,
      bankBalance: app.bankBalance != null ? num(app.bankBalance) : null,
      referral: friendlySource(app.contact?.referrer ?? null, app.contact?.source ?? null),
      requestedAmount: num(t.requestedAmount),
      approvedAmount: null,
      fundedAmount: 0,
      appliedAt: new Date(t.createdAt).toISOString(),
      nextPaymentId: null,
      nextDueDate: null,
      nextDueAmount: 0,
      outstanding: 0,
      paidToDate: 0,
      daysOverdue: 0,
      isProcessing: false,
      lastResult: null,
      paidCount: 0,
      totalCount: 0,
      schedule: [],
      newEmailCount: 0,
      awaitingReply: false,
      moneyOut: 0,
      profit: 0,
      potentialProfit: 0,
      dueTodayAmount: 0,
      dueTodayCount: 0,
      overdueCount: 0,
      isTopUp: true,
      topUpRequestId: t.id,
      topUpApplicationId: app.id,
      topUpContactId: t.contactId ?? app.contact?.id ?? null,
    });
  }

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
      moneyOut,
      paidBack,
      profit,
      potentialProfit,
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

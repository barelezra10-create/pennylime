import { prisma } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

const num = (v: number | string | { toString(): string } | null | undefined) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
};

export type FinancialsPeriod = {
  startDate: Date;
  endDate: Date;
  days: number;
};

export function periodFromDays(days: number): FinancialsPeriod {
  return {
    startDate: new Date(Date.now() - days * DAY),
    endDate: new Date(),
    days,
  };
}

export type LoanOps = {
  pendingReview: number;
  approvedNotFunded: number;
  rejected: number;
  active: number; // currently repaying
  late: number;
  paidOff: number;
  defaulted: number;
  totalApplications: number;
};

export type MoneyFlow = {
  totalDisbursed: number; // lifetime money out the door
  outstandingPrincipal: number; // money currently lent out
  principalRecovered: number; // principal already collected back
  revenueLifetime: number; // interest + late fees collected lifetime
  revenuePeriod: number; // interest + late fees collected in period
  defaultLossesLifetime: number; // principal stuck in COLLECTIONS
};

export type AdSpendBreakdown = {
  totalSpend: number;
  byPlatform: Array<{ platform: string; spend: number; impressions: number; clicks: number; conversions: number }>;
};

export type FinancialSummary = {
  period: FinancialsPeriod;
  loanOps: LoanOps;
  moneyFlow: MoneyFlow;
  adSpend: AdSpendBreakdown;
  newContacts: number;
  fundedThisPeriod: number;
  // computed
  cac: number; // ad spend / new contacts
  cacFunded: number; // ad spend / new funded loans
  roas: number; // period revenue / period ad spend
  netProfitPeriod: number; // period revenue - period ad spend
  netProfitLifetime: number; // lifetime revenue - lifetime ad spend - default losses
};

export async function getFinancialSummary(periodDays = 30): Promise<FinancialSummary> {
  const period = periodFromDays(periodDays);

  const [
    pendingReview,
    approvedNotFunded,
    rejected,
    active,
    late,
    paidOff,
    defaulted,
    totalApplications,
    fundedNotPaidOff,
    paymentsPeriod,
    paymentsLifetime,
    adSpendPeriod,
    adSpendLifetime,
    adSpendByPlatform,
    newContacts,
    fundedThisPeriod,
    collectionsApps,
  ] = await Promise.all([
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.application.count({ where: { status: "APPROVED" } }),
    prisma.application.count({ where: { status: "REJECTED" } }),
    prisma.application.count({ where: { status: "ACTIVE" } }),
    prisma.application.count({ where: { status: "LATE" } }),
    prisma.application.count({ where: { status: "PAID_OFF" } }),
    prisma.application.count({ where: { status: "COLLECTIONS" } }),
    prisma.application.count(),
    prisma.application.findMany({
      where: { status: { in: ["ACTIVE", "LATE"] } },
      select: { fundedAmount: true, loanAmount: true, payments: { select: { principal: true, paidAt: true, status: true } } },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: period.startDate } },
      select: { amount: true, principal: true, interest: true, lateFee: true },
    }),
    prisma.payment.findMany({
      where: { OR: [{ status: "PAID" }, { paidAt: { not: null } }] },
      select: { amount: true, principal: true, interest: true, lateFee: true },
    }),
    prisma.adSpend.aggregate({
      where: { date: { gte: period.startDate } },
      _sum: { spend: true },
    }),
    prisma.adSpend.aggregate({ _sum: { spend: true } }),
    prisma.adSpend.groupBy({
      by: ["platform"],
      where: { date: { gte: period.startDate } },
      _sum: { spend: true, impressions: true, clicks: true, conversions: true },
    }),
    prisma.contact.count({ where: { createdAt: { gte: period.startDate } } }),
    prisma.application.count({ where: { fundedAt: { gte: period.startDate } } }),
    prisma.application.findMany({
      where: { status: "COLLECTIONS" },
      select: { loanAmount: true, fundedAmount: true, payments: { select: { principal: true, status: true, paidAt: true } } },
    }),
  ]);

  // Lifetime disbursed: everything ever funded
  const allFundedApps = await prisma.application.findMany({
    where: { fundedAt: { not: null } },
    select: { fundedAmount: true, loanAmount: true },
  });
  const totalDisbursed = allFundedApps.reduce((sum, a) => sum + (num(a.fundedAmount) || num(a.loanAmount)), 0);

  // Outstanding principal = sum across active loans of (funded - principal_recovered)
  const outstandingPrincipal = fundedNotPaidOff.reduce((sum, app) => {
    const funded = num(app.fundedAmount) || num(app.loanAmount);
    const recovered = app.payments
      .filter((p) => p.status === "PAID" || p.paidAt)
      .reduce((s, p) => s + num(p.principal), 0);
    return sum + Math.max(funded - recovered, 0);
  }, 0);

  const principalRecovered = paymentsLifetime.reduce((s, p) => s + num(p.principal), 0);
  const revenueLifetime = paymentsLifetime.reduce((s, p) => s + num(p.interest) + num(p.lateFee), 0);
  const revenuePeriod = paymentsPeriod.reduce((s, p) => s + num(p.interest) + num(p.lateFee), 0);

  const defaultLossesLifetime = collectionsApps.reduce((sum, app) => {
    const funded = num(app.fundedAmount) || num(app.loanAmount);
    const recovered = app.payments
      .filter((p) => p.status === "PAID" || p.paidAt)
      .reduce((s, p) => s + num(p.principal), 0);
    return sum + Math.max(funded - recovered, 0);
  }, 0);

  const totalAdSpendPeriod = num(adSpendPeriod._sum.spend);
  const totalAdSpendLifetime = num(adSpendLifetime._sum.spend);

  return {
    period,
    loanOps: {
      pendingReview,
      approvedNotFunded,
      rejected,
      active,
      late,
      paidOff,
      defaulted,
      totalApplications,
    },
    moneyFlow: {
      totalDisbursed,
      outstandingPrincipal,
      principalRecovered,
      revenueLifetime,
      revenuePeriod,
      defaultLossesLifetime,
    },
    adSpend: {
      totalSpend: totalAdSpendPeriod,
      byPlatform: adSpendByPlatform.map((r) => ({
        platform: r.platform,
        spend: num(r._sum.spend),
        impressions: r._sum.impressions || 0,
        clicks: r._sum.clicks || 0,
        conversions: r._sum.conversions || 0,
      })),
    },
    newContacts,
    fundedThisPeriod,
    cac: newContacts > 0 ? totalAdSpendPeriod / newContacts : 0,
    cacFunded: fundedThisPeriod > 0 ? totalAdSpendPeriod / fundedThisPeriod : 0,
    roas: totalAdSpendPeriod > 0 ? revenuePeriod / totalAdSpendPeriod : 0,
    netProfitPeriod: revenuePeriod - totalAdSpendPeriod,
    netProfitLifetime: revenueLifetime - totalAdSpendLifetime - defaultLossesLifetime,
  };
}

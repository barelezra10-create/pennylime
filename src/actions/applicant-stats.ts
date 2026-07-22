"use server";
import { prisma } from "@/lib/db";
const num = (v: number | string | { toString(): string } | null | undefined) => v == null ? 0 : typeof v === "number" ? v : Number(v.toString());

export type ApplicantStats = {
  totalAsk: number;          // sum of loanAmount across ALL applications
  requestedCount: number;    // number of applicants (all applications)
  advancesCount: number;     // number funded
  avgAdvance: number;        // average funded amount
  avgPaymentDays: number | null; // avg days funded -> paid off (null if no payoffs yet)
  topProfessions: { name: string; count: number }[]; // top 5 gig platforms
};

export async function getApplicantStats(): Promise<ApplicantStats> {
  const apps = await prisma.application.findMany({
    select: {
      loanAmount: true, fundedAmount: true, fundedAt: true, status: true, platform: true,
      payments: { where: { OR: [{ status: "PAID" }, { paidAt: { not: null } }] }, select: { paidAt: true }, orderBy: { paidAt: "desc" }, take: 1 },
    },
  });
  let totalAsk = 0, advancesCount = 0, fundedSum = 0;
  const platformCounts = new Map<string, number>();
  const payDays: number[] = [];
  for (const a of apps) {
    totalAsk += num(a.loanAmount);
    if (a.fundedAt) { advancesCount++; fundedSum += num(a.fundedAmount) || num(a.loanAmount); }
    if (a.status === "PAID_OFF" && a.fundedAt && a.payments[0]?.paidAt) {
      payDays.push((new Date(a.payments[0].paidAt).getTime() - new Date(a.fundedAt).getTime()) / 86400000);
    }
    if (a.platform) for (const raw of a.platform.split(",").map((s) => s.trim()).filter(Boolean)) {
      const key = raw.toLowerCase();
      platformCounts.set(key, (platformCounts.get(key) || 0) + 1);
    }
  }
  const topProfessions = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  return {
    totalAsk,
    requestedCount: apps.length,
    advancesCount,
    avgAdvance: advancesCount ? fundedSum / advancesCount : 0,
    avgPaymentDays: payDays.length ? Math.round(payDays.reduce((s, x) => s + x, 0) / payDays.length) : null,
    topProfessions,
  };
}

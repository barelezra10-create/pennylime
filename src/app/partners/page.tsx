import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isPartnerAuthed } from "@/lib/partner-auth";
import { getFinancialSummary } from "@/lib/financials";
import { getAccount, listAchTransfers } from "@/lib/increase";
import { PartnerLogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PartnerDashboard() {
  if (!(await isPartnerAuthed())) {
    redirect("/partners/login");
  }

  const [financials, totalApps, fundedApps, balanceRes, transfersRes] = await Promise.all([
    getFinancialSummary(30),
    prisma.application.count(),
    prisma.application.findMany({
      where: { fundedAt: { not: null } },
      orderBy: { fundedAt: "desc" },
      take: 10,
      select: {
        id: true,
        applicationCode: true,
        firstName: true,
        lastName: true,
        loanAmount: true,
        fundedAmount: true,
        status: true,
        fundedAt: true,
      },
    }),
    getAccount(),
    listAchTransfers(15),
  ]);

  const fundedCount = financials.loanOps.active + financials.loanOps.late + financials.loanOps.paidOff;
  const expectedProfit = financials.moneyFlow.expectedRevenueOutstanding;

  const balanceCents = balanceRes.ok ? balanceRes.data.balances.current_balance : null;
  const balanceUsd = balanceCents == null ? null : balanceCents / 100;
  const availableCents = balanceRes.ok ? balanceRes.data.balances.available_balance : null;
  const availableUsd = availableCents == null ? null : availableCents / 100;

  const transfers = transfersRes.ok ? transfersRes.data.data : [];

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e4e4e7] pb-6 mb-8">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            Penny<span className="text-[#15803d]">Lime<span className="text-[#a3e635]">.</span></span>
          </span>
          <span className="ml-3 inline-flex items-center rounded-full bg-[#f0fdf4] text-[#15803d] text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1">
            Partner view
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/admin/partner-deck"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-[#15803d] hover:underline"
          >
            Download 2026 deck ↗
          </a>
          <PartnerLogoutButton />
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio at a glance</h1>
        <p className="mt-1 text-sm text-[#71717a]">
          Live snapshot · period: last {financials.period.days} days · refreshed just now
        </p>
      </div>

      {/* Big KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Applications" value={totalApps.toString()} sub={`${financials.loanOps.pendingReview} pending`} />
        <KpiCard label="Funded loans" value={fundedCount.toString()} sub={`${financials.fundedThisPeriod} in period`} accent />
        <KpiCard label="Money out" value={fmtMoney(financials.moneyFlow.outstandingPrincipal)} sub={`${fmtMoney(financials.moneyFlow.totalDisbursed)} lifetime`} />
        <KpiCard label="Expected profit" value={fmtMoney(expectedProfit)} sub="interest on active loans" highlight />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <KpiCard label="Revenue (30d)" value={fmtMoney(financials.moneyFlow.revenuePeriod)} sub={`${fmtMoney(financials.moneyFlow.revenueLifetime)} lifetime`} />
        <KpiCard label="Net profit (30d)" value={fmtMoney(financials.netProfitPeriod)} sub="revenue − ad spend" />
        <KpiCard label="Default losses" value={fmtMoney(financials.moneyFlow.defaultLossesLifetime)} sub="principal in collections" />
        <KpiCard
          label="Increase balance"
          value={balanceUsd == null ? ", , ," : fmtMoney(balanceUsd)}
          sub={availableUsd == null ? "balance unavailable" : `${fmtMoney(availableUsd)} available`}
          accent
        />
      </div>

      {/* Recent funded loans */}
      <Section title="Recent funded loans" sub={`${fundedApps.length} most recent disbursements`}>
        {fundedApps.length === 0 ? (
          <Empty>No funded loans yet.</Empty>
        ) : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <Th>Date</Th>
                  <Th>Borrower</Th>
                  <Th>Code</Th>
                  <Th align="right">Requested</Th>
                  <Th align="right">Funded</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {fundedApps.map((a) => {
                  const requested = Number(a.loanAmount);
                  const funded = a.fundedAmount ? Number(a.fundedAmount) : 0;
                  return (
                    <tr key={a.id} className="border-t border-[#f4f4f5]">
                      <Td>{a.fundedAt ? fmtDate(a.fundedAt.toISOString()) : ", , ,"}</Td>
                      <Td>
                        <div className="font-medium text-[#0a0a0a]">{a.firstName} {a.lastName}</div>
                      </Td>
                      <Td><code className="text-[11px] font-mono text-[#71717a] bg-stone-50 rounded px-1.5 py-0.5">{a.applicationCode}</code></Td>
                      <Td align="right" className="tabular-nums">{fmtMoney(requested)}</Td>
                      <Td align="right" className="tabular-nums font-semibold text-[#15803d]">{fmtMoney(funded)}</Td>
                      <Td align="right">
                        <StatusPill status={a.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Increase Transactions */}
      <Section title="Increase transactions" sub="Most recent ACH credits (disbursements) and debits (repayments)">
        {transfers.length === 0 ? (
          <Empty>
            {transfersRes.ok ? "No transfers yet." : `Increase API unavailable: ${transfersRes.error}`}
          </Empty>
        ) : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <Th>Date</Th>
                  <Th>Direction</Th>
                  <Th>Descriptor</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const cents = t.amount;
                  const isCredit = cents > 0;
                  const usd = Math.abs(cents) / 100;
                  return (
                    <tr key={t.id} className="border-t border-[#f4f4f5]">
                      <Td>{fmtDate(t.created_at)}</Td>
                      <Td>
                        {isCredit ? (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#b45309]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                            Out · disbursement
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#15803d]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
                            In · repayment
                          </span>
                        )}
                      </Td>
                      <Td className="font-mono text-[11px] text-[#71717a]">{t.statement_descriptor}</Td>
                      <Td align="right" className={`tabular-nums font-semibold ${isCredit ? "text-[#b45309]" : "text-[#15803d]"}`}>
                        {isCredit ? "−" : "+"}{fmtMoney(usd)}
                      </Td>
                      <Td align="right">
                        <span className="text-[11px] font-mono text-[#52525b] bg-stone-50 rounded px-1.5 py-0.5">
                          {t.status}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="mt-12 pt-6 border-t border-[#e4e4e7] text-[11px] text-[#a1a1aa]">
        <p>PennyLime · operated by 770 Technology Way LLC · Confidential. Data refreshes on each page load.</p>
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────── */

function KpiCard({ label, value, sub, accent, highlight }: { label: string; value: string; sub: string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-[#0d3320] border-[#0d3320] text-white" : accent ? "bg-[#f0fdf4] border-[#dcfce7]" : "bg-white border-[#e4e4e7]"}`}>
      <div className={`text-[10px] uppercase tracking-[0.08em] font-semibold ${highlight ? "text-white/60" : "text-[#71717a]"}`}>{label}</div>
      <div className={`mt-2 text-[26px] font-bold tracking-tight tabular-nums ${highlight ? "text-white" : accent ? "text-[#15803d]" : "text-[#0a0a0a]"}`}>{value}</div>
      <div className={`mt-1.5 text-[11px] ${highlight ? "text-[#a3e635]" : "text-[#71717a]"}`}>{sub}</div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {sub ? <p className="mt-0.5 text-[12px] text-[#71717a]">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-[#e4e4e7] p-10 text-center text-[13px] text-[#71717a]">
      {children}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-5 py-3 text-[10px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa] ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`px-5 py-3.5 text-[13px] text-[#27272a] ${align === "right" ? "text-right" : "text-left"} ${className || ""}`}>
      {children}
    </td>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    FUNDED: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]", label: "Funded" },
    ACTIVE: { bg: "bg-[#eef4ff]", text: "text-[#2563eb]", label: "Active" },
    REPAYING: { bg: "bg-[#eef4ff]", text: "text-[#2563eb]", label: "Repaying" },
    LATE: { bg: "bg-[#fff1f2]", text: "text-[#dc2626]", label: "Late" },
    PAID_OFF: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]", label: "Paid off" },
    COLLECTIONS: { bg: "bg-[#fff1f2]", text: "text-[#dc2626]", label: "Collections" },
  };
  const c = map[status] || { bg: "bg-stone-100", text: "text-[#52525b]", label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

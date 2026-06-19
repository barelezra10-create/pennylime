import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isPartnerAuthed } from "@/lib/partner-auth";
import { getFinancialSummary, type FinancialSummary } from "@/lib/financials";
import { getAccount, listAchTransfers, type AchTransfer } from "@/lib/increase";
import { PartnerLogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

type FundedApp = {
  id: string;
  applicationCode: string;
  firstName: string;
  lastName: string;
  loanAmount: unknown;
  fundedAmount: unknown;
  status: string;
  fundedAt: Date | null;
};

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

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[/partners] ${label} failed:`, msg);
    return { ok: false, error: `${label}: ${msg}` };
  }
}

export default async function PartnerDashboard() {
  if (!(await isPartnerAuthed())) {
    redirect("/partners/login");
  }

  try {
    return await renderDashboard();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    console.error("[/partners] fatal render error:", msg, stack);
    return (
      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-900">Partner dashboard failed to render</h1>
          <p className="mt-2 text-sm text-red-800">{msg}</p>
          {stack ? (
            <pre className="mt-4 text-[11px] text-red-700 overflow-auto bg-white border border-red-200 rounded p-3 max-h-80">{stack}</pre>
          ) : null}
        </div>
      </div>
    );
  }
}

async function renderDashboard() {
  const [financialsRes, totalAppsRes, fundedAppsRes, balanceRes, transfersRes] = await Promise.all([
    safe("financials", () => getFinancialSummary(30)),
    safe("totalApps", () => prisma.application.count()),
    safe<FundedApp[]>("fundedApps", () =>
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
    ),
    safe("increaseAccount", () => getAccount()),
    safe("increaseTransfers", () => listAchTransfers(15)),
  ]);

  const errors: string[] = [];
  for (const r of [financialsRes, totalAppsRes, fundedAppsRes, balanceRes, transfersRes]) {
    if (!r.ok) errors.push(r.error);
  }

  // Fallbacks so the page still renders if a query fails.
  const financials: FinancialSummary = financialsRes.ok
    ? financialsRes.data
    : {
        period: { startDate: new Date(), endDate: new Date(), days: 30 },
        loanOps: { pendingReview: 0, approvedNotFunded: 0, rejected: 0, active: 0, late: 0, paidOff: 0, defaulted: 0, totalApplications: 0 },
        moneyFlow: { totalDisbursed: 0, outstandingPrincipal: 0, principalRecovered: 0, revenueLifetime: 0, revenuePeriod: 0, defaultLossesLifetime: 0, expectedRevenueOutstanding: 0, cashCollectedPeriod: 0, cashCollectedLifetime: 0 },
        adSpend: { totalSpend: 0, byPlatform: [] },
        newContacts: 0,
        fundedThisPeriod: 0,
        cac: 0,
        cacFunded: 0,
        roas: 0,
        netProfitPeriod: 0,
        netProfitLifetime: 0,
      };
  const totalApps = totalAppsRes.ok ? totalAppsRes.data : 0;
  const fundedApps: FundedApp[] = fundedAppsRes.ok ? fundedAppsRes.data : [];

  const fundedCount = financials.loanOps.active + financials.loanOps.late + financials.loanOps.paidOff;
  const expectedProfit = financials.moneyFlow.expectedRevenueOutstanding;

  const balanceData =
    balanceRes.ok && balanceRes.data.ok ? balanceRes.data.data : null;
  const balanceUsd = balanceData?.balances ? balanceData.balances.current_balance / 100 : null;
  const availableUsd = balanceData?.balances ? balanceData.balances.available_balance / 100 : null;
  const balanceError = balanceRes.ok && !balanceRes.data.ok ? balanceRes.data.error : null;

  const transfers: AchTransfer[] =
    transfersRes.ok && transfersRes.data.ok ? transfersRes.data.data.data : [];
  const transfersError =
    transfersRes.ok && !transfersRes.data.ok ? transfersRes.data.error : null;

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

      {errors.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-900">
          <strong className="font-semibold">Some data unavailable:</strong>
          <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Big KPIs — pipeline state */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Applications" value={totalApps.toString()} sub="total received" />
        <KpiCard
          label="Pending review"
          value={financials.loanOps.pendingReview.toString()}
          sub="awaiting decision"
        />
        <KpiCard
          label="Rejected"
          value={financials.loanOps.rejected.toString()}
          sub="all-time declines"
        />
        <KpiCard label="Funded loans" value={fundedCount.toString()} sub={`${financials.fundedThisPeriod} in period`} accent />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 mt-4">
        <KpiCard label="Money out" value={fmtMoney(financials.moneyFlow.outstandingPrincipal)} sub={`${fmtMoney(financials.moneyFlow.totalDisbursed)} lifetime`} />
        <KpiCard label="Expected profit" value={fmtMoney(expectedProfit)} sub="interest on active loans" highlight />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <KpiCard label="Cash collected (30d)" value={fmtMoney(financials.moneyFlow.cashCollectedPeriod)} sub={`${fmtMoney(financials.moneyFlow.cashCollectedLifetime)} lifetime`} />
        <KpiCard label="Fee revenue (30d)" value={fmtMoney(financials.moneyFlow.revenuePeriod)} sub={`${fmtMoney(financials.moneyFlow.revenueLifetime)} lifetime · interest only`} accent />
        <KpiCard label="Default losses" value={fmtMoney(financials.moneyFlow.defaultLossesLifetime)} sub="principal in collections" />
        <KpiCard
          label="Increase balance"
          value={balanceUsd == null ? "—" : fmtMoney(balanceUsd)}
          sub={availableUsd == null ? (balanceError || "balance unavailable") : `${fmtMoney(availableUsd)} available`}
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
            {transfersError ? `Increase API unavailable: ${transfersError}` : "No transfers yet."}
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
        <p>PennyLime · operated by 770 Technology LLC · Confidential. Data refreshes on each page load.</p>
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

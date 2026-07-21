"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { addAdSpend, syncAllAdSpend } from "@/actions/ad-spend";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fmtMoney } from "@/lib/loan-summary";

type FinancialSummary = {
  period: { startDate: string; endDate: string; days: number };
  loanOps: {
    pendingReview: number;
    approvedNotFunded: number;
    rejected: number;
    active: number;
    late: number;
    paidOff: number;
    defaulted: number;
    totalApplications: number;
  };
  moneyFlow: {
    totalDisbursed: number;
    outstandingPrincipal: number;
    principalRecovered: number;
    revenueLifetime: number;
    revenuePeriod: number;
    defaultLossesLifetime: number;
    expectedRevenueOutstanding: number;
    cashCollectedPeriod: number;
    cashCollectedLifetime: number;
  };
  pipeline: {
    requestedPending: number;
    countPending: number;
    requestedApproved: number;
    countApproved: number;
    requestedTotalOpen: number;
    outstandingToCollect: number;
  };
  adSpend: {
    totalSpend: number;
    byPlatform: Array<{ platform: string; spend: number; impressions: number; clicks: number; conversions: number }>;
  };
  newContacts: number;
  fundedThisPeriod: number;
  cac: number;
  cacFunded: number;
  roas: number;
  netProfitPeriod: number;
  netProfitLifetime: number;
};

type ContactMetrics = {
  total: number;
  byStage: Record<string, number>;
  newThisWeek: number;
  abandoned: number;
};

type RecentActivity = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  contact: { firstName: string; lastName: string | null; email: string } | null;
};

type PendingApp = { id: string; applicationCode: string; firstName: string; lastName: string; loanAmount: number; createdAt: string };
type LandingPageRow = { id: string; slug: string; metaTitle: string; heroHeadlineLine1: string; published: boolean; updatedAt: string; leadCount: number };
type TrackingRow = { key: string; total: number; converted: number };
type AdSpendRow = { id: string; date: string; platform: string; campaign: string | null; spend: number; impressions: number; clicks: number; conversions: number; notes: string | null };
type EmailCampaignRow = { id: string; name: string; subject: string; status: string; createdAt: string };
type EmailSequenceRow = { id: string; name: string; triggerType: string; active: boolean; createdAt: string };
type EventRow = { id: string; eventName: string; status: string; value: number | null; currency: string | null; createdAt: string };

const TABS = [
  { id: "loans", label: "Loan Portal", icon: "$" },
  { id: "marketing", label: "Email & SMS", icon: "✉" },
  { id: "media", label: "Paid Media", icon: "↗" },
  { id: "content", label: "Landing Pages", icon: "▢" },
  { id: "crm", label: "CRM", icon: "◉" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FUNNEL_STAGES = ["LEAD", "CONTACTED", "APPLICANT", "APPROVED", "OFFER_ACCEPTED", "FUNDED", "REPAYING"] as const;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function DashboardTabs(props: {
  financials: FinancialSummary;
  contactMetrics: ContactMetrics;
  recentActivities: RecentActivity[];
  pendingApps: PendingApp[];
  landingPages: LandingPageRow[];
  lpStats: { total: number; published: number };
  trackingBreakdown: { sources: TrackingRow[]; campaigns: TrackingRow[] };
  recentAdSpend: AdSpendRow[];
  emailCampaigns: EmailCampaignRow[];
  emailSequences: EmailSequenceRow[];
  emailTemplateCount: number;
  recentEvents: EventRow[];
  articleStats: { total: number; published: number };
}) {
  // The dashboard is the Loan Portal overview. The other analytics views
  // (marketing/media/content/crm) live under their own top-nav sections and
  // are reached here only via ?focus= (e.g. Paid Media → Spend & ROI), so we
  // don't render a duplicate tab row that mirrors the global top nav.
  const focus = useSearchParams().get("focus");
  const tab: TabId = (TABS.some((t) => t.id === focus) ? focus : "loans") as TabId;

  return (
    <div>
      <PageHeader title="Dashboard" />

      {tab === "loans" && <LoanPortalTab f={props.financials} pendingApps={props.pendingApps} />}
      {tab === "marketing" && (
        <MarketingTab campaigns={props.emailCampaigns} sequences={props.emailSequences} templateCount={props.emailTemplateCount} />
      )}
      {tab === "media" && (
        <PaidMediaTab
          f={props.financials}
          recentAdSpend={props.recentAdSpend}
          tracking={props.trackingBreakdown}
          contactMetrics={props.contactMetrics}
          recentEvents={props.recentEvents}
        />
      )}
      {tab === "content" && (
        <ContentTab landingPages={props.landingPages} lpStats={props.lpStats} articleStats={props.articleStats} />
      )}
      {tab === "crm" && (
        <CrmTab contactMetrics={props.contactMetrics} recentActivities={props.recentActivities} />
      )}
    </div>
  );
}

/* ─── TAB 1: LOAN PORTAL ─────────────────────────────────────────── */

function LoanPortalTab({ f, pendingApps }: { f: FinancialSummary; pendingApps: PendingApp[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[12px] text-[#71717a]">Loan operations · last {f.period.days} days</p>
        <div className="flex items-center gap-2">
          <a
            href="/partners"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white border border-[#15803d] hover:bg-[#f0fdf4] text-[#15803d] text-[12px] font-semibold px-3.5 py-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            Open partner view
          </a>
          <a
            href="/api/admin/partner-deck"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[12px] font-semibold px-3.5 py-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download 2026 Partner Deck
          </a>
        </div>
      </div>

      <PartnerShareCard />

      <Section title="Cash requested by applicants">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BigCard
            label="Total requested (open)"
            value={fmtMoney(f.pipeline.requestedTotalOpen)}
            sub={`${f.pipeline.countPending + f.pipeline.countApproved} open applications`}
            accent="text-[#15803d]"
            href="/admin/applications"
          />
          <BigCard
            label="Awaiting decision"
            value={fmtMoney(f.pipeline.requestedPending)}
            sub={`${f.pipeline.countPending} pending review`}
            accent="text-[#f59e0b]"
            href="/admin/applications?from=Pending"
          />
          <BigCard
            label="Approved, to fund"
            value={fmtMoney(f.pipeline.requestedApproved)}
            sub={`${f.pipeline.countApproved} ready to fund`}
            href="/admin/applications?from=Approved"
          />
          <BigCard
            label="Outstanding to collect"
            value={fmtMoney(f.pipeline.outstandingToCollect)}
            sub="still owed on live loans"
            href="/admin/applications?from=Active"
          />
        </div>
      </Section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Pending review" value={f.loanOps.pendingReview.toString()} sub="awaiting decision" accent="bg-[#f59e0b]" href="/admin/applications?from=Pending" />
        <Kpi label="Rejected" value={f.loanOps.rejected.toString()} sub="all-time" accent="bg-[#71717a]" href="/admin/applications?status=REJECTED" />
        <Kpi label="Active" value={f.loanOps.active.toString()} sub={`${f.loanOps.late} late`} accent="bg-[#15803d]" href="/admin/applications?from=Active" />
        <Kpi label="Paid off" value={f.loanOps.paidOff.toString()} sub="completed" accent="bg-[#0ea5e9]" href="/admin/applications?from=Paid%20Off" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <BigCard label="Money out" value={fmtMoney(f.moneyFlow.outstandingPrincipal)} sub={`${fmtMoney(f.moneyFlow.totalDisbursed)} lifetime disbursed`} />
        <BigCard label="Expected profit" value={fmtMoney(f.moneyFlow.expectedRevenueOutstanding)} sub="interest booked on active loans" accent="text-[#15803d]" />
        <BigCard label="Default losses" value={fmtMoney(f.moneyFlow.defaultLossesLifetime)} sub="principal in collections" accent={f.moneyFlow.defaultLossesLifetime > 0 ? "text-[#dc2626]" : ""} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigCard
          label="Cash collected (30d)"
          value={fmtMoney(f.moneyFlow.cashCollectedPeriod)}
          sub={`${fmtMoney(f.moneyFlow.cashCollectedLifetime)} lifetime`}
        />
        <BigCard
          label="Fee revenue (30d)"
          value={fmtMoney(f.moneyFlow.revenuePeriod)}
          sub={`${fmtMoney(f.moneyFlow.revenueLifetime)} lifetime · interest only`}
          accent="text-[#15803d]"
        />
        <BigCard
          label="Principal recovered"
          value={fmtMoney(f.moneyFlow.principalRecovered)}
          sub="returned advance capital"
        />
        <BigCard
          label="Net profit (30d)"
          value={fmtMoney(f.netProfitPeriod)}
          sub="fee revenue − ad spend"
          accent={f.netProfitPeriod >= 0 ? "text-[#15803d]" : "text-[#dc2626]"}
        />
      </div>

      <Section title="Lifetime profit">
        <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
          <div className="grid grid-cols-3 gap-6 text-center">
            <ProfitStat label="Lifetime revenue" value={fmtMoney(f.moneyFlow.revenueLifetime)} />
            <ProfitStat label="Default losses" value={`-${fmtMoney(f.moneyFlow.defaultLossesLifetime)}`} negative />
            <ProfitStat label="Net profit (lifetime)" value={fmtMoney(f.netProfitLifetime)} positive={f.netProfitLifetime >= 0} />
          </div>
        </div>
      </Section>

      <Section title="Pending review" action={<Link href="/admin/applications" className="text-[12px] text-[#71717a] hover:text-black">View all →</Link>}>
        {pendingApps.length === 0 ? (
          <Empty>No applications waiting for review.</Empty>
        ) : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] divide-y divide-[#f4f4f5]">
            {pendingApps.map((app) => (
              <Link key={app.id} href={`/admin/applications/${app.id}`} className="block p-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-black truncate">
                      {app.firstName} {app.lastName}
                    </p>
                    <p className="text-[11px] font-mono text-[#a1a1aa]">{app.applicationCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-black tabular-nums">{fmtMoney(app.loanAmount)}</p>
                    <p className="text-[11px] text-[#a1a1aa]">{relativeTime(app.createdAt)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─── TAB 2: EMAIL & SMS MARKETING ──────────────────────────────── */

function MarketingTab({ campaigns, sequences, templateCount }: { campaigns: EmailCampaignRow[]; sequences: EmailSequenceRow[]; templateCount: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Templates" value={templateCount.toString()} sub="reusable email designs" accent="bg-[#15803d]" href="/admin/email/templates" />
        <Kpi label="Campaigns" value={campaigns.length.toString()} sub="recent" accent="bg-[#0ea5e9]" href="/admin/email/campaigns" />
        <Kpi label="Sequences" value={sequences.filter((s) => s.active).length.toString()} sub={`${sequences.length} total`} accent="bg-[#7c3aed]" href="/admin/email/sequences" />
        <Kpi label="SMS" value="—" sub="Coming soon" accent="bg-[#a1a1aa]" />
      </div>

      <Section title="Email" action={<div className="flex items-center gap-2">
        <Link href="/admin/email/campaigns" className="bg-[#15803d] text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 hover:bg-[#166534]">+ New campaign</Link>
        <Link href="/admin/email/sequences" className="border border-[#e4e4e7] text-[12px] font-semibold rounded-lg px-3 py-1.5 hover:bg-[#fafafa]">+ Sequence</Link>
        <Link href="/admin/email/templates" className="border border-[#e4e4e7] text-[12px] font-semibold rounded-lg px-3 py-1.5 hover:bg-[#fafafa]">+ Template</Link>
      </div>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Recent campaigns">
            {campaigns.length === 0 ? (
              <Empty>No campaigns yet.</Empty>
            ) : (
              <ul className="divide-y divide-[#f4f4f5]">
                {campaigns.map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-black truncate">{c.name}</p>
                      <p className="text-[11px] text-[#71717a] truncate">{c.subject}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.04em] font-bold bg-[#fafafa] text-[#71717a] rounded px-1.5 py-0.5">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Active sequences">
            {sequences.length === 0 ? (
              <Empty>No sequences yet.</Empty>
            ) : (
              <ul className="divide-y divide-[#f4f4f5]">
                {sequences.map((s) => (
                  <li key={s.id} className="py-2.5 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-black truncate">{s.name}</p>
                      <p className="text-[11px] font-mono text-[#71717a]">trigger: {s.triggerType}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.04em] font-bold rounded px-1.5 py-0.5 ${s.active ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fafafa] text-[#a1a1aa]"}`}>
                      {s.active ? "Active" : "Off"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      <Section title="SMS marketing">
        <Card>
          <div className="text-center py-8">
            <p className="text-[14px] text-[#71717a] mb-3">SMS campaigns and sequences not wired yet.</p>
            <p className="text-[12px] text-[#a1a1aa]">Pick a provider (Twilio, MessageBird, etc.) and we&apos;ll build the same campaign/sequence/template UI as email.</p>
          </div>
        </Card>
      </Section>
    </div>
  );
}

/* ─── TAB 3: PAID MEDIA ─────────────────────────────────────────── */

function PaidMediaTab({
  f,
  recentAdSpend,
  tracking,
  contactMetrics,
  recentEvents,
}: {
  f: FinancialSummary;
  recentAdSpend: AdSpendRow[];
  tracking: { sources: TrackingRow[]; campaigns: TrackingRow[] };
  contactMetrics: ContactMetrics;
  recentEvents: EventRow[];
}) {
  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: contactMetrics.byStage[stage] || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigCard label="Ad spend (30d)" value={fmtMoney(f.adSpend.totalSpend)} sub="across all platforms" />
        <BigCard label="ROAS (30d)" value={`${f.roas.toFixed(2)}x`} sub={`Revenue / spend`} accent={f.roas >= 1 ? "text-[#15803d]" : "text-[#dc2626]"} />
        <BigCard label="CAC (30d)" value={fmtMoney(f.cac)} sub={`per new contact`} />
        <BigCard label="CAC funded" value={fmtMoney(f.cacFunded)} sub={`per funded loan`} accent={f.cacFunded > 0 ? "text-[#0ea5e9]" : ""} />
      </div>

      <Section
        title="Spend by platform (30d)"
        action={<SyncButton />}
      >
        {f.adSpend.byPlatform.length === 0 ? (
          <Empty>No ad spend logged yet. Add a row below to start tracking.</Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {f.adSpend.byPlatform.map((p) => (
              <div key={p.platform} className="bg-white rounded-xl border border-[#e4e4e7] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-1">{p.platform}</p>
                <p className="text-[20px] font-extrabold text-black tabular-nums">{fmtMoney(p.spend)}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-[#a1a1aa]">Impr</span><br /><span className="font-semibold text-black tabular-nums">{p.impressions.toLocaleString()}</span></div>
                  <div><span className="text-[#a1a1aa]">Clicks</span><br /><span className="font-semibold text-black tabular-nums">{p.clicks.toLocaleString()}</span></div>
                  <div><span className="text-[#a1a1aa]">Conv</span><br /><span className="font-semibold text-black tabular-nums">{p.conversions.toLocaleString()}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Add ad spend">
        <Card>
          <form action={addAdSpend} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
            <Field label="Date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field label="Platform" name="platform" select options={["google_ads", "meta", "tiktok", "microsoft", "other"]} required />
            <Field label="Campaign" name="campaign" placeholder="(optional)" />
            <Field label="Spend $" name="spend" type="number" step="0.01" required />
            <Field label="Impr" name="impressions" type="number" />
            <Field label="Clicks" name="clicks" type="number" />
            <button type="submit" className="bg-[#15803d] text-white text-[12px] font-semibold rounded-lg py-2 hover:bg-[#166534]">+ Add</button>
          </form>
        </Card>
      </Section>

      <Section title="Recent spend entries" action={recentAdSpend.length > 0 ? <span className="text-[11px] text-[#a1a1aa]">last 20</span> : null}>
        {recentAdSpend.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <Card>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.04em] text-[#a1a1aa] border-b border-[#e4e4e7]">
                    <th className="px-5 py-2">Date</th>
                    <th className="px-5 py-2">Platform</th>
                    <th className="px-5 py-2">Campaign</th>
                    <th className="px-5 py-2 text-right">Spend</th>
                    <th className="px-5 py-2 text-right">Impr</th>
                    <th className="px-5 py-2 text-right">Clicks</th>
                    <th className="px-5 py-2 text-right">Conv</th>
                    <th className="px-5 py-2 text-right">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAdSpend.map((s) => (
                    <tr key={s.id} className="border-b border-[#f4f4f5]">
                      <td className="px-5 py-2 tabular-nums text-[#71717a]">{new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td className="px-5 py-2 font-mono">{s.platform}</td>
                      <td className="px-5 py-2 truncate max-w-[180px]">{s.campaign || "—"}</td>
                      <td className="px-5 py-2 text-right font-bold tabular-nums">{fmtMoney(s.spend, { decimals: 2 })}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{s.impressions.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{s.clicks.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{s.conversions.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-[#71717a]">{s.clicks > 0 ? `$${(s.spend / s.clicks).toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Section>

      <Section title="Visitor funnel" action={<Link href="/admin/contacts" className="text-[12px] text-[#71717a] hover:text-black">View contacts →</Link>}>
        <Card>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#71717a" }} width={80} />
              <Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={i < 2 ? "#a1a1aa" : i < 4 ? "#15803d" : "#166534"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrackingTable title="Top traffic sources" subtitle="utm_source" rows={tracking.sources} />
        <TrackingTable title="Top campaigns" subtitle="utm_campaign" rows={tracking.campaigns} />
      </div>

      <Section title="Tracking & event setup" action={<Link href="/admin/settings/tracking" className="text-[12px] text-[#71717a] hover:text-black">Open tracking settings →</Link>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Recent events fired">
            {recentEvents.length === 0 ? (
              <Empty>No events yet. Fire a test from <Link href="/admin/settings/tracking" className="text-[#15803d] underline">Settings → Events</Link>.</Empty>
            ) : (
              <ul className="divide-y divide-[#f4f4f5]">
                {recentEvents.map((e) => (
                  <li key={e.id} className="py-2 flex items-center justify-between text-[12px]">
                    <code className="font-mono text-black">{e.eventName}</code>
                    <span className="text-[10px] text-[#a1a1aa]">{relativeTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Pixels & scripts">
            <p className="text-[12px] text-[#71717a] mb-3">Pixels are configured in <Link href="/admin/settings/tracking" className="text-[#15803d] underline">Settings → Tracking</Link>.</p>
            <ul className="text-[12px] space-y-1.5">
              <li>• Google Ads (gclid + offline conversions)</li>
              <li>• GA4</li>
              <li>• Meta Pixel + CAPI</li>
              <li>• TikTok Pixel + Events API</li>
              <li>• Microsoft UET</li>
              <li>• PennyClick first-party ID</li>
            </ul>
          </Card>
        </div>
      </Section>
    </div>
  );
}

/* ─── TAB 4: LANDING PAGES & CONTENT ────────────────────────────── */

function ContentTab({ landingPages, lpStats, articleStats }: { landingPages: LandingPageRow[]; lpStats: { total: number; published: number }; articleStats: { total: number; published: number } }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Landing pages" value={`${lpStats.published} / ${lpStats.total}`} sub="published / total" accent="bg-[#15803d]" href="/admin/content/landing-pages" />
        <Kpi label="Articles" value={`${articleStats.published} / ${articleStats.total}`} sub="published / total" accent="bg-[#0ea5e9]" href="/admin/content/articles" />
        <Kpi label="Platforms" value="14" sub="static seed" accent="bg-[#7c3aed]" href="/admin/content/platforms" />
        <Kpi label="States" value="50" sub="static seed" accent="bg-[#f59e0b]" href="/admin/content/states" />
      </div>

      <Section
        title="Landing pages"
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/content/landing-pages/new" className="bg-[#15803d] text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 hover:bg-[#166534]">+ New LP</Link>
            <Link href="/admin/content/landing-pages" className="text-[12px] text-[#71717a] hover:text-black">Manage all →</Link>
          </div>
        }
      >
        {landingPages.length === 0 ? (
          <Empty>No landing pages yet.</Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {landingPages.map((lp) => (
              <div key={lp.id} className="bg-white rounded-xl border border-[#e4e4e7] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-[#a1a1aa] truncate">/lp/{lp.slug}</p>
                    <h4 className="text-[13px] font-bold text-black mt-0.5 line-clamp-2">{lp.heroHeadlineLine1 || lp.metaTitle}</h4>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] rounded px-1.5 py-0.5 ${lp.published ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fafafa] text-[#a1a1aa]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${lp.published ? "bg-[#15803d]" : "bg-[#a1a1aa]"}`} />
                    {lp.published ? "Live" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#71717a] mb-3">
                  <span><strong className="text-black">{lp.leadCount}</strong> leads</span>
                  <span>Updated {relativeTime(lp.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/content/landing-pages/${lp.id}/edit`} className="flex-1 text-center text-[12px] font-semibold text-black bg-[#fafafa] hover:bg-[#f4f4f5] rounded-lg py-1.5">Edit</Link>
                  <a href={`/lp/${lp.slug}`} target="_blank" rel="noreferrer" className="flex-1 text-center text-[12px] font-semibold text-white bg-[#15803d] hover:bg-[#166534] rounded-lg py-1.5">Preview ↗</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="All content sections">
        <div className="flex flex-wrap gap-2">
          <ContentChip href="/admin/content/articles" label="Articles" />
          <ContentChip href="/admin/content/platforms" label="Platforms (Uber, Lyft, etc.)" />
          <ContentChip href="/admin/content/states" label="States" />
          <ContentChip href="/admin/content/tools" label="Tools" />
          <ContentChip href="/admin/content/comparisons" label="Comparisons" />
          <ContentChip href="/admin/content/form-templates" label="Form templates" />
          <ContentChip href="/admin/content/categories" label="Categories" />
        </div>
      </Section>
    </div>
  );
}

/* ─── TAB 5: CRM ─────────────────────────────────────────────────── */

function CrmTab({ contactMetrics, recentActivities }: { contactMetrics: ContactMetrics; recentActivities: RecentActivity[] }) {
  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: contactMetrics.byStage[stage] || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total contacts" value={contactMetrics.total.toString()} sub={`${contactMetrics.newThisWeek} new this week`} accent="bg-[#15803d]" href="/admin/contacts" />
        <Kpi label="Active leads" value={(contactMetrics.byStage.LEAD || 0).toString()} sub="haven't applied yet" accent="bg-[#0ea5e9]" href="/admin/contacts?stage=LEAD" />
        <Kpi label="Applicants" value={(contactMetrics.byStage.APPLICANT || 0).toString()} sub="in apply flow" accent="bg-[#7c3aed]" href="/admin/contacts?stage=APPLICANT" />
        <Kpi label="Abandoned" value={contactMetrics.abandoned.toString()} sub="dropped off" accent={contactMetrics.abandoned > 0 ? "bg-[#dc2626]" : "bg-[#a1a1aa]"} href="/admin/abandoned" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Pipeline funnel">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#71717a" }} width={80} />
              <Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={i < 2 ? "#a1a1aa" : i < 4 ? "#15803d" : "#166534"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-[#71717a]">
            <Link href="/admin/pipeline" className="hover:text-black">Open kanban →</Link>
            <Link href="/admin/contacts" className="hover:text-black">All contacts →</Link>
          </div>
        </Card>
        <Card title="Recent activity">
          {recentActivities.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {recentActivities.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-[#f0fdf4] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#a1a1aa]">{a.type.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-[#a1a1aa] shrink-0">{relativeTime(a.createdAt)}</span>
                    </div>
                    <p className="text-[13px] font-medium text-black truncate">{a.title}</p>
                    {a.contact && (
                      <p className="text-[11px] text-[#71717a] truncate">{a.contact.firstName} {a.contact.lastName || ""} · {a.contact.email}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── shared atoms ─────────────────────────────────────────────── */

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold text-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      {title && <h3 className="text-[13px] font-bold text-black mb-3">{title}</h3>}
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, accent, href }: { label: string; value: string; sub: string; accent: string; href?: string }) {
  const Wrap: React.ElementType = href ? Link : "div";
  return (
    <Wrap {...(href ? { href } : {})} className="block bg-white rounded-xl border border-[#e4e4e7] p-4 relative overflow-hidden hover:border-[#a1a1aa] transition-colors">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-1.5">{label}</p>
      <p className="text-[22px] font-extrabold tracking-[-0.02em] text-black tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-[#a1a1aa] mt-1.5 truncate">{sub}</p>
    </Wrap>
  );
}

function BigCard({ label, value, sub, accent, href }: { label: string; value: string; sub: string; accent?: string; href?: string }) {
  const inner = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">{label}</p>
      <p className={`text-[26px] font-extrabold tracking-[-0.02em] tabular-nums leading-none ${accent || "text-black"}`}>{value}</p>
      <p className="text-[11px] text-[#a1a1aa] mt-2">{sub}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block bg-white rounded-xl border border-[#e4e4e7] p-5 hover:border-[#15803d] hover:shadow-sm transition-all">
        {inner}
      </Link>
    );
  }
  return <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">{inner}</div>;
}

function ProfitStat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">{label}</p>
      <p className={`text-[28px] font-extrabold tracking-[-0.02em] tabular-nums ${positive ? "text-[#15803d]" : negative ? "text-[#dc2626]" : "text-black"}`}>{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-dashed border-[#e4e4e7] p-8 text-center text-[13px] text-[#71717a]">{children}</div>;
}

function ContentChip({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center rounded-md border border-[#e4e4e7] bg-white px-3 py-1.5 text-[13px] text-[#71717a] hover:text-black hover:border-[#a1a1aa] transition-colors">
      {label}
    </Link>
  );
}

function TrackingTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: TrackingRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <Card title={title}>
      <p className="text-[10px] font-mono text-[#a1a1aa] -mt-2 mb-3">{subtitle}</p>
      {rows.length === 0 ? (
        <Empty>No tracked leads yet.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-black font-medium truncate pr-2">{r.key}</span>
                <span className="text-[#71717a] tabular-nums shrink-0">
                  {r.total} · {r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0}% conv.
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#fafafa] overflow-hidden">
                <div className="h-full bg-[#15803d] rounded-full" style={{ width: `${(r.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  async function onClick() {
    setSyncing(true);
    try {
      const r = await syncAllAdSpend(30);
      const lines: string[] = [];
      if (r.google_ads.ok) lines.push(`Google Ads: ${r.google_ads.rows} rows`);
      else lines.push(`Google Ads: ${r.google_ads.error}`);
      if (r.meta.ok) lines.push(`Meta: ${r.meta.rows} rows`);
      else lines.push(`Meta: ${r.meta.error}`);
      const ok = r.google_ads.ok || r.meta.ok;
      (ok ? toast.success : toast.error)(lines.join(" · "), { duration: 6000 });
    } finally {
      setSyncing(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={syncing}
      className="text-[12px] font-semibold text-white bg-[#15803d] hover:bg-[#166534] rounded-lg px-3 py-1.5 disabled:opacity-60"
    >
      {syncing ? "Syncing…" : "Sync from Google + Meta"}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
  step,
  select,
  options,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  step?: string;
  select?: boolean;
  options?: string[];
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">{label}</span>
      {select ? (
        <select name={name} required={required} defaultValue={defaultValue || ""} className="text-[13px] border border-[#e4e4e7] rounded-lg px-2.5 py-1.5">
          <option value="">—</option>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          step={step}
          defaultValue={defaultValue}
          className="text-[13px] border border-[#e4e4e7] rounded-lg px-2.5 py-1.5"
        />
      )}
    </label>
  );
}

function PartnerShareCard() {
  const partnerUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/partners`
      : "https://your-domain.com/partners";
  const password = "Penny2026!";

  return (
    <div className="rounded-xl border border-[#dcfce7] bg-[#f0fdf4] p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#15803d] text-white flex items-center justify-center flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[#15803d] uppercase tracking-[0.06em]">Partner share link</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <div>
            <span className="text-[#71717a]">URL: </span>
            <code className="font-mono text-[#0a0a0a] bg-white border border-[#dcfce7] rounded px-2 py-0.5 text-[12px]">{partnerUrl}</code>
          </div>
          <div>
            <span className="text-[#71717a]">Password: </span>
            <code className="font-mono text-[#0a0a0a] bg-white border border-[#dcfce7] rounded px-2 py-0.5 text-[12px]">{password}</code>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(`Partner dashboard: ${partnerUrl}\nPassword: ${password}`);
          toast.success("Copied URL + password");
        }}
        className="text-[12px] font-semibold text-[#15803d] hover:underline whitespace-nowrap"
      >
        Copy
      </button>
    </div>
  );
}

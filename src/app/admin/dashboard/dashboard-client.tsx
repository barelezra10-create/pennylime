"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { ApplicationTable } from "@/components/application-table";
import type { ApplicationWithDocuments } from "@/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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
  details?: string | null;
  performedBy?: string | null;
  createdAt: string;
  contact: { firstName: string; lastName: string | null; email: string } | null;
};

type LandingPageRow = {
  id: string;
  slug: string;
  metaTitle: string;
  heroHeadlineLine1: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  leadCount: number;
};

type TrackingRow = { key: string; total: number; converted: number };

const FUNNEL_STAGES = ["LEAD", "CONTACTED", "APPLICANT", "APPROVED", "FUNDED", "REPAYING"] as const;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function activityTypeLabel(type: string): string {
  const map: Record<string, string> = {
    app_started: "App Started",
    note_added: "Note",
    stage_change: "Stage Change",
    rep_assigned: "Assigned",
    document_uploaded: "Doc Uploaded",
    application_linked: "Application",
  };
  return map[type] || type;
}

function fmtPct(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export function DashboardClient({
  applications,
  contactMetrics,
  recentActivities,
  landingPages,
  lpStats,
  trackingBreakdown,
  topSource,
}: {
  applications: ApplicationWithDocuments[];
  contactMetrics: ContactMetrics;
  recentActivities: RecentActivity[];
  landingPages: LandingPageRow[];
  lpStats: { total: number; published: number };
  trackingBreakdown: { sources: TrackingRow[]; campaigns: TrackingRow[]; mediums: TrackingRow[] };
  topSource: TrackingRow | null;
}) {
  const activeCount = applications.filter((a) => a.status === "ACTIVE").length;

  const outstandingTotal = applications
    .filter((a) => a.status === "ACTIVE" || a.status === "LATE" || a.status === "COLLECTIONS")
    .reduce((sum, a) => sum + Number(a.loanAmount), 0);

  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: contactMetrics.byStage[stage] || 0,
  }));

  const recent = [...applications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      {/* Loan Ops KPIs (original design) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Loans"
          value={activeCount}
          color="green"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
            </svg>
          }
        />
        <StatCard
          label="Outstanding"
          value={`$${outstandingTotal.toLocaleString("en-US")}`}
          color="blue"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
            </svg>
          }
        />
        <StatCard
          label="New Leads This Week"
          value={contactMetrics.newThisWeek}
          color="amber"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Contacts"
          value={contactMetrics.total}
          color="gray"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          }
        />
      </div>

      {/* Conversion Funnel + Activity Feed (original layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-bold text-black">Conversion Funnel</h3>
            <Link href="/admin/pipeline" className="text-sm text-[#71717a] hover:text-black transition-colors">
              View pipeline →
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#71717a" }} width={80} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={i < 2 ? "#a1a1aa" : i < 4 ? "#15803d" : "#166534"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
          <h2 className="text-[15px] font-semibold text-black mb-5">Recent Activity</h2>
          {recentActivities.length === 0 ? (
            <p className="text-[13px] text-[#a1a1aa]">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentActivities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-[#f4f4f5] flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 text-[#71717a]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#a1a1aa]">
                        {activityTypeLabel(activity.type)}
                      </span>
                      <span className="text-[11px] text-[#a1a1aa] shrink-0">{relativeTime(activity.createdAt)}</span>
                    </div>
                    <p className="text-[13px] font-medium text-black truncate">{activity.title}</p>
                    {activity.contact && (
                      <p className="text-[12px] text-[#71717a]">
                        {activity.contact.firstName} {activity.contact.lastName}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Landing Pages */}
      <div>
        <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold text-black">Landing Pages</h2>
            <p className="text-[12px] text-[#71717a] mt-0.5">
              {lpStats.published} live · {lpStats.total - lpStats.published} drafts · lead counts matched via utm_campaign
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/content/landing-pages/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white text-[13px] font-semibold px-3.5 py-2 hover:bg-[#166534] transition-colors"
            >
              <span className="text-base leading-none">+</span> New LP
            </Link>
            <Link href="/admin/content/landing-pages" className="text-sm text-[#71717a] hover:text-black transition-colors">
              Manage all →
            </Link>
          </div>
        </div>
        {landingPages.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-[#e4e4e7] p-10 text-center">
            <p className="text-[14px] text-[#71717a] mb-4">No landing pages yet.</p>
            <Link
              href="/admin/content/landing-pages/new"
              className="inline-flex items-center rounded-lg bg-[#15803d] text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-[#166534] transition-colors"
            >
              Create your first LP
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {landingPages.map((lp) => (
              <LandingPageCard key={lp.id} lp={lp} />
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2 text-[13px]">
          <ContentChip href="/admin/content/articles" label="Articles" />
          <ContentChip href="/admin/content/platforms" label="Platforms" />
          <ContentChip href="/admin/content/states" label="States" />
          <ContentChip href="/admin/content/tools" label="Tools" />
          <ContentChip href="/admin/content/comparisons" label="Comparisons" />
          <ContentChip href="/admin/content/form-templates" label="Form templates" />
          <ContentChip href="/admin/email" label="Email templates" />
        </div>
      </div>

      {/* Tracking & Attribution */}
      <div>
        <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold text-black">Tracking & Attribution</h2>
            <p className="text-[12px] text-[#71717a] mt-0.5">
              {topSource ? (
                <>
                  Top source: <strong className="text-black">{topSource.key}</strong> with {topSource.total} leads
                </>
              ) : (
                <>No tracked leads yet — pass utm_source/medium/campaign on LP traffic to populate.</>
              )}
            </p>
          </div>
          <Link href="/admin/contacts" className="text-sm text-[#71717a] hover:text-black transition-colors">
            Filter contacts →
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TrackingTable title="Top sources" subtitle="utm_source" rows={trackingBreakdown.sources} />
          <TrackingTable title="Top campaigns" subtitle="utm_campaign" rows={trackingBreakdown.campaigns} />
          <TrackingTable title="Top mediums" subtitle="utm_medium" rows={trackingBreakdown.mediums} />
        </div>
      </div>

      {/* Recent Applications (original) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-black">Recent Applications</h2>
          <Link href="/admin/applications" className="text-sm text-[#71717a] hover:text-black transition-colors">
            View all →
          </Link>
        </div>
        <ApplicationTable applications={recent} />
      </div>
    </div>
  );
}

function LandingPageCard({ lp }: { lp: LandingPageRow }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 hover:border-[#a1a1aa] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono text-[#a1a1aa] truncate">/lp/{lp.slug}</p>
          <h4 className="text-[14px] font-bold text-black mt-0.5 line-clamp-2 leading-snug">
            {lp.heroHeadlineLine1 || lp.metaTitle}
          </h4>
        </div>
        {lp.published ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-[#15803d] bg-[#f0fdf4] rounded px-1.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" /> Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-[#a1a1aa] bg-[#fafafa] rounded px-1.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa]" /> Draft
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#71717a] mb-3">
        <span><strong className="text-black">{lp.leadCount}</strong> leads</span>
        <span>Updated {relativeTime(lp.updatedAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/content/landing-pages/${lp.id}/edit`}
          className="flex-1 text-center text-[12px] font-semibold text-black bg-[#fafafa] hover:bg-[#f4f4f5] rounded-lg py-1.5 transition-colors"
        >
          Edit
        </Link>
        <a
          href={`/lp/${lp.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center text-[12px] font-semibold text-white bg-[#15803d] hover:bg-[#166534] rounded-lg py-1.5 transition-colors"
        >
          Preview ↗
        </a>
      </div>
    </div>
  );
}

function ContentChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md border border-[#e4e4e7] bg-white px-3 py-1.5 text-[#71717a] hover:text-black hover:border-[#a1a1aa] transition-colors"
    >
      {label}
    </Link>
  );
}

function TrackingTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: TrackingRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[14px] font-bold text-black">{title}</h3>
        <span className="text-[10px] font-mono text-[#a1a1aa]">{subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[#a1a1aa]">No leads tracked yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-black font-medium truncate pr-2">{r.key}</span>
                <span className="text-[#71717a] tabular-nums shrink-0">
                  {r.total} · {fmtPct(r.converted, r.total)} conv.
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#fafafa] overflow-hidden">
                <div className="h-full bg-[#15803d] rounded-full" style={{ width: `${(r.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

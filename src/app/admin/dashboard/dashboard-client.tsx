"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { ApplicationTable } from "@/components/application-table";
import type { ApplicationWithDocuments } from "@/types";
import { KANBAN_STAGES } from "@/lib/contact-helpers";
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

const FUNNEL_STAGES = ["LEAD", "CONTACTED", "APPLICANT", "APPROVED", "FUNDED", "REPAYING"] as const;

export function DashboardClient({
  applications,
  contactMetrics,
  recentActivities,
}: {
  applications: ApplicationWithDocuments[];
  contactMetrics: ContactMetrics;
  recentActivities: RecentActivity[];
}) {
  // Loan metrics from applications
  const activeCount = applications.filter((a) => a.status === "ACTIVE").length;

  const outstandingTotal = applications
    .filter((a) => a.status === "ACTIVE" || a.status === "LATE" || a.status === "COLLECTIONS")
    .reduce((sum, a) => sum + Number(a.loanAmount), 0);

  // Recharts funnel data
  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: contactMetrics.byStage[stage] || 0,
  }));

  // Recent 5 applications
  const recent = [...applications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      {/* 4 Stat Cards */}
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
          value={`$${outstandingTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
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

      {/* Row 2: Funnel Chart + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel (recharts) */}
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

        {/* Activity Feed */}
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

      {/* Row 3: Recent Applications */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-black">Recent Applications</h2>
          <Link
            href="/admin/applications"
            className="text-sm text-[#71717a] hover:text-black transition-colors"
          >
            View all →
          </Link>
        </div>
        <ApplicationTable applications={recent} />
      </div>
    </div>
  );
}

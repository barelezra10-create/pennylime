"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";

interface Metrics {
  totalSent: number;
  openRate: number;
  clickRate: number;
  activeCampaigns: number;
  activeSequences: number;
}

export function EmailDashboardClient({ metrics }: { metrics: Metrics }) {
  return (
    <div>
      <PageHeader title="Email Marketing" description="Campaigns, sequences, and templates" />

      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Emails Sent" value={metrics.totalSent} color="blue" />
        <StatCard label="Open Rate" value={`${metrics.openRate}%`} color="green" />
        <StatCard label="Click Rate" value={`${metrics.clickRate}%`} color="green" />
        <StatCard label="Active Campaigns" value={metrics.activeCampaigns} color="amber" />
        <StatCard label="Active Sequences" value={metrics.activeSequences} color="gray" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Campaigns", desc: "Send one-time emails to segments", href: "/admin/email/campaigns", cta: "View Campaigns" },
          { label: "Sequences", desc: "Automated drip sequences triggered by events", href: "/admin/email/sequences", cta: "View Sequences" },
          { label: "Templates", desc: "Reusable email templates", href: "/admin/email/templates", cta: "View Templates" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="bg-white rounded-xl p-6 border border-[#e4e4e7] hover:shadow-sm transition-shadow">
            <h3 className="text-[15px] font-bold text-black mb-1">{item.label}</h3>
            <p className="text-[13px] text-[#71717a] mb-4">{item.desc}</p>
            <span className="text-[13px] font-medium text-[#15803d]">{item.cta} &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

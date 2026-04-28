"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
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

type Summary = {
  totalLPs: number;
  publishedLPs: number;
  totalContacts: number;
  newLeadsThisWeek: number;
  pipelineValue: number;
  topSource: { name: string; count: number } | null;
};

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
    app_started: "App started",
    note_added: "Note",
    stage_change: "Stage change",
    rep_assigned: "Rep assigned",
    document_uploaded: "Doc uploaded",
    application_linked: "Application",
  };
  return map[type] || type;
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export function DashboardClient({
  landingPages,
  contactMetrics,
  recentActivities,
  trackingBreakdown,
  summary,
}: {
  landingPages: LandingPageRow[];
  contactMetrics: ContactMetrics;
  recentActivities: RecentActivity[];
  trackingBreakdown: { sources: TrackingRow[]; campaigns: TrackingRow[]; mediums: TrackingRow[] };
  summary: Summary;
}) {
  const funnelData = FUNNEL_STAGES.map((stage) => ({
    name: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: contactMetrics.byStage[stage] || 0,
  }));

  return (
    <div className="space-y-10">
      <PageHeader title="Dashboard" />

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Landing pages"
          value={`${summary.publishedLPs} / ${summary.totalLPs}`}
          sub={`${summary.publishedLPs} published`}
          accent="bg-[#15803d]"
          href="/admin/content/landing-pages"
        />
        <KpiTile
          label="Total contacts"
          value={summary.totalContacts.toLocaleString()}
          sub={`+${summary.newLeadsThisWeek} this week`}
          accent="bg-[#0ea5e9]"
          href="/admin/contacts"
        />
        <KpiTile
          label="Pipeline value"
          value={fmtMoney(summary.pipelineValue)}
          sub="Approved + active"
          accent="bg-[#f59e0b]"
          href="/admin/pipeline"
        />
        <KpiTile
          label="Top source"
          value={summary.topSource?.name || "—"}
          sub={summary.topSource ? `${summary.topSource.count} leads` : "No leads yet"}
          accent="bg-[#7c3aed]"
          href="#tracking"
        />
      </div>

      {/* SECTION 1: LANDING PAGES */}
      <Section
        eyebrow="Landing Pages"
        title="Manage your funnels"
        sub="Recent landing pages with traffic attributed via UTM campaign matching the LP slug."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/content/landing-pages/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white text-[13px] font-semibold px-3.5 py-2 hover:bg-[#166534] transition-colors"
            >
              <span className="text-base leading-none">+</span> New LP
            </Link>
            <Link
              href="/admin/content/landing-pages"
              className="text-sm text-[#71717a] hover:text-black transition-colors"
            >
              Manage all →
            </Link>
          </div>
        }
      >
        {landingPages.length === 0 ? (
          <EmptyState
            text="No landing pages yet. Create your first one to start driving leads."
            href="/admin/content/landing-pages/new"
            cta="Create landing page"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {landingPages.map((lp) => (
              <LandingPageCard key={lp.id} lp={lp} />
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
          <ContentLink href="/admin/content/articles" label="Articles" />
          <ContentLink href="/admin/content/platforms" label="Platforms" />
          <ContentLink href="/admin/content/states" label="States" />
          <ContentLink href="/admin/content/tools" label="Tools" />
          <ContentLink href="/admin/content/comparisons" label="Comparisons" />
          <ContentLink href="/admin/content/form-templates" label="Form templates" />
        </div>
      </Section>

      {/* SECTION 2: CRM PIPELINE */}
      <Section
        eyebrow="CRM"
        title="Pipeline & activity"
        sub="Move contacts through your funnel and watch what your team is doing."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/pipeline"
              className="text-sm text-[#71717a] hover:text-black transition-colors"
            >
              Open pipeline →
            </Link>
            <Link
              href="/admin/contacts"
              className="text-sm text-[#71717a] hover:text-black transition-colors"
            >
              All contacts →
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[14px] font-bold text-black">Conversion funnel</h3>
              <span className="text-[11px] text-[#a1a1aa]">{contactMetrics.total} contacts</span>
            </div>
            <p className="text-[12px] text-[#71717a] mb-4">
              From first lead to actively repaying borrower.
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 12, right: 12 }}>
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
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <MiniMetric label="New this week" value={contactMetrics.newThisWeek.toString()} />
              <MiniMetric label="Abandoned" value={contactMetrics.abandoned.toString()} />
              <MiniMetric
                label="Lead → Applicant"
                value={fmtPct(
                  (contactMetrics.byStage.APPLICANT || 0) +
                    (contactMetrics.byStage.APPROVED || 0) +
                    (contactMetrics.byStage.FUNDED || 0) +
                    (contactMetrics.byStage.REPAYING || 0),
                  contactMetrics.total
                )}
              />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-bold text-black">Recent activity</h3>
              <Link href="/admin/audit" className="text-[11px] text-[#71717a] hover:text-black">
                Audit log →
              </Link>
            </div>
            {recentActivities.length === 0 ? (
              <p className="text-[13px] text-[#a1a1aa]">No activity yet.</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {recentActivities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-[#f0fdf4] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#a1a1aa]">
                          {activityTypeLabel(a.type)}
                        </span>
                        <span className="text-[10px] text-[#a1a1aa] shrink-0">{relativeTime(a.createdAt)}</span>
                      </div>
                      <p className="text-[13px] font-medium text-black truncate">{a.title}</p>
                      {a.contact && (
                        <p className="text-[11px] text-[#71717a] truncate">
                          {a.contact.firstName} {a.contact.lastName || ""} · {a.contact.email}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* SECTION 3: TRACKING */}
      <Section
        id="tracking"
        eyebrow="Tracking"
        title="Attribution & sources"
        sub="Where leads come from and how well each source converts to applications."
        action={
          <Link href="/admin/contacts" className="text-sm text-[#71717a] hover:text-black transition-colors">
            Filter contacts →
          </Link>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TrackingTable title="Top sources" subtitle="utm_source" rows={trackingBreakdown.sources} />
          <TrackingTable title="Top campaigns" subtitle="utm_campaign" rows={trackingBreakdown.campaigns} />
          <TrackingTable title="Top mediums" subtitle="utm_medium" rows={trackingBreakdown.mediums} />
        </div>
      </Section>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  sub,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  sub: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#15803d] mb-1.5">{eyebrow}</p>
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-black">{title}</h2>
          <p className="text-[13px] text-[#71717a] mt-1">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl p-5 border border-[#e4e4e7] ${className}`}>{children}</div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-[#e4e4e7] bg-white p-5 hover:border-[#a1a1aa] hover:shadow-sm transition-all relative overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">{label}</p>
      <p className="text-[24px] font-extrabold tracking-[-0.02em] text-black leading-none truncate">{value}</p>
      <p className="text-[12px] text-[#71717a] mt-1.5 truncate">{sub}</p>
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fafafa] rounded-lg py-2.5">
      <p className="text-[18px] font-extrabold text-black tabular-nums">{value}</p>
      <p className="text-[10px] text-[#71717a] uppercase tracking-[0.04em] mt-0.5">{label}</p>
    </div>
  );
}

function LandingPageCard({ lp }: { lp: LandingPageRow }) {
  return (
    <div className="group bg-white rounded-xl border border-[#e4e4e7] p-4 hover:border-[#a1a1aa] hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono text-[#a1a1aa] truncate">/lp/{lp.slug}</p>
          <h4 className="text-[14px] font-bold text-black mt-0.5 line-clamp-2 leading-snug">
            {lp.heroHeadlineLine1 || lp.metaTitle}
          </h4>
        </div>
        <StatusBadge published={lp.published} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#71717a] mb-3">
        <span>{lp.leadCount} leads</span>
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

function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-[#15803d] bg-[#f0fdf4] rounded px-1.5 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" /> Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-[#a1a1aa] bg-[#fafafa] rounded px-1.5 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa]" /> Draft
    </span>
  );
}

function ContentLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md border border-[#e4e4e7] px-3 py-1.5 text-[#71717a] hover:text-black hover:border-[#a1a1aa] transition-colors"
    >
      {label}
    </Link>
  );
}

function TrackingTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: TrackingRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <Card>
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
                <div
                  className="h-full bg-[#15803d] rounded-full"
                  style={{ width: `${(r.total / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmptyState({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-[#e4e4e7] p-10 text-center">
      <p className="text-[14px] text-[#71717a] mb-4">{text}</p>
      <Link
        href={href}
        className="inline-flex items-center rounded-lg bg-[#15803d] text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-[#166534] transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}

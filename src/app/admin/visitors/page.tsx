import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { detectSource } from "@/lib/tracking/source-detect";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function detectBrowser(ua: string | null | undefined): string {
  if (!ua) return "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  if (/MSIE|Trident/i.test(ua)) return "IE";
  return "";
}

function fmtDate(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function detectDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ window?: string; source?: string }> }) {
  const params = await searchParams;
  const windowDays = Number(params.window) || 7;
  const sourceFilter = params.source || "";
  const since = new Date(Date.now() - windowDays * DAY);

  // Pull all visitors in window for source-detection aggregates (groupBy on
  // a derived field isn't possible in SQL — compute in JS over the slice).
  const [allInWindow, totalVisits, totalUnique, topPages, topCountries] = await Promise.all([
    prisma.pennyClick.findMany({
      where: { lastSeen: { gte: since } },
      orderBy: { lastSeen: "desc" },
      take: 500,
      include: {
        pageViews: { orderBy: { createdAt: "desc" }, take: 5, select: { path: true, createdAt: true } },
      },
    }),
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.pennyClick.count({ where: { lastSeen: { gte: since } } }),
    prisma.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { path: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.pennyClick.groupBy({
      by: ["firstCountry"],
      where: { lastSeen: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),
  ]);

  // Compute "real source" per visitor (UTM > referrer-derived > direct)
  const visitorSources = allInWindow.map((v) => ({
    visitor: v,
    source: detectSource({ utmSource: v.lastUtmSource, referrer: v.firstReferrer }),
  }));

  // Aggregate top sources from the derived field
  const sourceCounts = new Map<string, { label: string; medium: string; count: number }>();
  for (const { source } of visitorSources) {
    const cur = sourceCounts.get(source.label) || { label: source.label, medium: source.medium, count: 0 };
    cur.count++;
    sourceCounts.set(source.label, cur);
  }
  const topSources = Array.from(sourceCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Top 100 most recent + optional source filter
  const filtered = sourceFilter
    ? visitorSources.filter((vs) => vs.source.label === sourceFilter).slice(0, 100)
    : visitorSources.slice(0, 100);
  const visitors = allInWindow.slice(0, 100);

  // Linked contacts for converted visitors
  const contactIds = visitors.map((v) => v.contactId).filter((id): id is string => !!id);
  const contacts =
    contactIds.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, email: true, stage: true },
        })
      : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <PageHeader title="Visitors" />

      <div className="flex items-center gap-2">
        {[1, 7, 30].map((d) => (
          <Link
            key={d}
            href={`/admin/visitors?window=${d}${sourceFilter ? `&source=${encodeURIComponent(sourceFilter)}` : ""}`}
            className={
              windowDays === d
                ? "bg-[#1a1a1a] text-white rounded-lg px-3 py-1.5 text-sm font-medium"
                : "text-[#71717a] hover:text-black px-3 py-1.5 text-sm font-medium"
            }
          >
            Last {d}d
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Unique visitors" value={totalUnique.toLocaleString()} sub={`last ${windowDays}d`} />
        <Kpi label="Page views" value={totalVisits.toLocaleString()} sub={`last ${windowDays}d`} />
        <Kpi label="Pages / visitor" value={totalUnique > 0 ? (totalVisits / totalUnique).toFixed(1) : "0"} sub="avg session depth" />
        <Kpi label="Converted" value={visitors.filter((v) => v.contactId).length.toString()} sub="became contacts" accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Top pages">
          {topPages.length === 0 ? (
            <Empty>No page views yet.</Empty>
          ) : (
            <ul className="divide-y divide-[#f4f4f5]">
              {topPages.map((p) => (
                <li key={p.path} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[12px] font-mono text-[#27272a] truncate flex-1 min-w-0">{p.path}</span>
                  <span className="text-[12px] font-semibold text-[#15803d] tabular-nums">{p._count.path}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top sources">
          {topSources.length === 0 ? (
            <Empty>No source data yet.</Empty>
          ) : (
            <ul className="divide-y divide-[#f4f4f5]">
              {topSources.map((s) => (
                <li key={s.label} className="py-2.5 flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/visitors?window=${windowDays}&source=${encodeURIComponent(s.label)}`}
                    className="flex items-center gap-2 text-[12px] text-[#27272a] hover:text-[#15803d] truncate flex-1 min-w-0"
                  >
                    <span className="truncate">{s.label}</span>
                    <span className="text-[10px] uppercase tracking-[0.04em] text-[#a1a1aa]">{s.medium}</span>
                  </Link>
                  <span className="text-[12px] font-semibold text-[#15803d] tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top countries">
          {topCountries.length === 0 ? (
            <Empty>No country data yet (Cloudflare proxy required).</Empty>
          ) : (
            <ul className="divide-y divide-[#f4f4f5]">
              {topCountries.map((c) => {
                const label = c.firstCountry || "Unknown";
                return (
                  <li key={label} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[#27272a] truncate flex-1 min-w-0">
                      <span className="mr-1.5">{countryFlag(c.firstCountry)}</span>
                      {label}
                    </span>
                    <span className="text-[12px] font-semibold text-[#15803d] tabular-nums">{c._count.id}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {sourceFilter ? (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-[#71717a]">Filtering:</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f0fdf4] text-[#15803d] px-2.5 py-1 font-semibold">
            source = {sourceFilter}
            <Link href={`/admin/visitors?window=${windowDays}`} className="hover:underline">×</Link>
          </span>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e4e4e7] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-tight">Recent visitors</h2>
          <span className="text-[11px] text-[#71717a]">{filtered.length} of {visitors.length}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[#71717a]">
            No visitors {sourceFilter ? `from ${sourceFilter} ` : ""}in the last {windowDays} days.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <Th>Last seen</Th>
                <Th>Visitor</Th>
                <Th>Country</Th>
                <Th>Pages</Th>
                <Th>Source</Th>
                <Th>Landing</Th>
                <Th>Device</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ visitor: v, source }) => {
                const contact = v.contactId ? contactById.get(v.contactId) : null;
                const lastPages = v.pageViews.slice(0, 3).map((p) => p.path);
                const os = detectDevice(v.firstUserAgent);
                const browser = detectBrowser(v.firstUserAgent);
                const deviceLabel = [browser, os].filter(Boolean).join(" / ") || "Unknown";
                return (
                  <tr key={v.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-[#0a0a0a]">{relTime(v.lastSeen)}</div>
                      <div className="text-[11px] text-[#a1a1aa]">{fmtDate(v.lastSeen)}</div>
                    </td>
                    <td className="px-5 py-3">
                      {contact ? (
                        <Link href={`/admin/contacts/${contact.id}`} className="text-[#15803d] font-medium hover:underline">
                          {contact.firstName} {contact.lastName || ""}
                        </Link>
                      ) : (
                        <span className="text-[#a1a1aa] font-mono text-[11px]">{v.id.slice(0, 14)}...</span>
                      )}
                      {contact ? (
                        <div className="text-[11px] text-[#71717a]">{contact.email}</div>
                      ) : v.firstIpAddress ? (
                        <div className="text-[11px] text-[#a1a1aa] font-mono">{v.firstIpAddress}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {v.firstCountry ? (
                        <span className="text-[#0a0a0a]">
                          <span className="mr-1.5">{countryFlag(v.firstCountry)}</span>
                          {v.firstCountry}
                        </span>
                      ) : (
                        <span className="text-[#a1a1aa]">,</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[#0a0a0a] font-semibold tabular-nums">{v.visitCount}</div>
                      {lastPages.length > 0 ? (
                        <div className="text-[11px] text-[#a1a1aa] font-mono truncate max-w-[180px]" title={lastPages.join(" → ")}>
                          {lastPages[0]}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-[#0a0a0a] font-medium">{source.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.04em] text-[#a1a1aa]">
                        {source.medium}
                        {v.lastUtmCampaign ? ` · ${v.lastUtmCampaign}` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-[#71717a] truncate max-w-[180px]" title={v.firstLandingPage || ""}>
                      {v.firstLandingPage || ","}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-[#71717a]">{deviceLabel}</td>
                    <td className="px-5 py-3">
                      {contact ? (
                        <span className="inline-flex items-center rounded-full bg-[#f0fdf4] text-[#15803d] text-[10px] font-semibold px-2 py-0.5">
                          {contact.stage}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-stone-100 text-[#71717a] text-[10px] font-semibold px-2 py-0.5">
                          ANON
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────── */

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "bg-[#f0fdf4] border-[#dcfce7]" : "bg-white border-[#e4e4e7]"}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#71717a]">{label}</div>
      <div className={`mt-2 text-[26px] font-bold tabular-nums tracking-tight ${accent ? "text-[#15803d]" : "text-[#0a0a0a]"}`}>{value}</div>
      <div className="mt-1.5 text-[11px] text-[#71717a]">{sub}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      <h3 className="text-[12px] font-semibold text-[#71717a] uppercase tracking-[0.06em] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-[#a1a1aa] py-4">{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-[10px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa] text-left">
      {children}
    </th>
  );
}

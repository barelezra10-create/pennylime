import { prisma } from "@/lib/db";
import { getContactMetrics } from "@/actions/contacts";
import { getRecentActivities } from "@/actions/activities";
import { getFinancialSummary } from "@/lib/financials";
import { getRecentAdSpend } from "@/actions/ad-spend";
import { DashboardTabs } from "./dashboard-tabs";

export const dynamic = "force-dynamic";

const APPLICANT_OR_BEYOND = ["APPLICANT", "APPROVED", "OFFER_ACCEPTED", "FUNDED", "REPAYING", "PAID_OFF"];

export default async function AdminDashboardPage() {
  const [
    financials,
    contactMetrics,
    recentActivities,
    pendingApps,
    landingPages,
    totalLPs,
    publishedLPs,
    contactsForTracking,
    recentAdSpend,
    emailCampaigns,
    emailSequences,
    emailTemplates,
    recentEvents,
    articles,
    publishedArticles,
  ] = await Promise.all([
    getFinancialSummary(30),
    getContactMetrics(),
    getRecentActivities(8),
    prisma.application.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, applicationCode: true, firstName: true, lastName: true, loanAmount: true, createdAt: true },
    }),
    prisma.landingPage.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, slug: true, metaTitle: true, heroHeadlineLine1: true, published: true, updatedAt: true },
    }),
    prisma.landingPage.count(),
    prisma.landingPage.count({ where: { published: true } }),
    prisma.contact.findMany({
      select: { utmSource: true, utmCampaign: true, utmMedium: true, stage: true, createdAt: true },
    }),
    getRecentAdSpend(20),
    prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.emailSequence.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.emailTemplate.count(),
    prisma.trackingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.article.count(),
    prisma.article.count({ where: { published: true } }),
  ]);

  const trackingBreakdown = (() => {
    const bySource = new Map<string, { total: number; converted: number }>();
    const byCampaign = new Map<string, { total: number; converted: number }>();
    for (const c of contactsForTracking) {
      const isConverted = APPLICANT_OR_BEYOND.includes(c.stage);
      const inc = (m: Map<string, { total: number; converted: number }>, k: string | null | undefined) => {
        const key = k && k.trim() ? k : "(direct)";
        const cur = m.get(key) || { total: 0, converted: 0 };
        cur.total++;
        if (isConverted) cur.converted++;
        m.set(key, cur);
      };
      inc(bySource, c.utmSource);
      inc(byCampaign, c.utmCampaign);
    }
    const toRows = (m: Map<string, { total: number; converted: number }>) =>
      Array.from(m.entries())
        .map(([key, v]) => ({ key, total: v.total, converted: v.converted }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);
    return { sources: toRows(bySource), campaigns: toRows(byCampaign) };
  })();

  const lpLeadCounts = new Map<string, number>();
  for (const c of contactsForTracking) {
    if (c.utmCampaign) lpLeadCounts.set(c.utmCampaign, (lpLeadCounts.get(c.utmCampaign) || 0) + 1);
  }

  return (
    <DashboardTabs
      financials={JSON.parse(
        JSON.stringify(financials, (_, v) => (typeof v === "bigint" ? Number(v) : v))
      )}
      contactMetrics={contactMetrics}
      recentActivities={recentActivities.map((a: typeof recentActivities[number]) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        contact: a.contact,
      }))}
      pendingApps={pendingApps.map((a: typeof pendingApps[number]) => ({
        id: a.id,
        applicationCode: a.applicationCode,
        firstName: a.firstName,
        lastName: a.lastName,
        loanAmount: Number(a.loanAmount),
        createdAt: a.createdAt.toISOString(),
      }))}
      landingPages={landingPages.map((lp: typeof landingPages[number]) => ({
        ...lp,
        updatedAt: lp.updatedAt.toISOString(),
        leadCount: lpLeadCounts.get(lp.slug) || 0,
      }))}
      lpStats={{ total: totalLPs, published: publishedLPs }}
      trackingBreakdown={trackingBreakdown}
      recentAdSpend={recentAdSpend.map((s: typeof recentAdSpend[number]) => ({
        id: s.id,
        date: s.date.toISOString(),
        platform: s.platform,
        campaign: s.campaign,
        spend: Number(s.spend),
        impressions: s.impressions,
        clicks: s.clicks,
        conversions: s.conversions,
        notes: s.notes,
      }))}
      emailCampaigns={emailCampaigns.map((c: typeof emailCampaigns[number]) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      }))}
      emailSequences={emailSequences.map((s: typeof emailSequences[number]) => ({
        id: s.id,
        name: s.name,
        triggerType: s.triggerType,
        active: s.active,
        createdAt: s.createdAt.toISOString(),
      }))}
      emailTemplateCount={emailTemplates}
      recentEvents={recentEvents.map((e: typeof recentEvents[number]) => ({
        id: e.id,
        eventName: e.eventName,
        status: e.status,
        value: e.value ? Number(e.value) : null,
        currency: e.currency,
        createdAt: e.createdAt.toISOString(),
      }))}
      articleStats={{ total: articles, published: publishedArticles }}
    />
  );
}

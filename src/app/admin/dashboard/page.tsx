import { prisma } from "@/lib/db";
import { getApplications } from "@/actions/applications";
import { getContactMetrics } from "@/actions/contacts";
import { getRecentActivities } from "@/actions/activities";
import { DashboardClient } from "./dashboard-client";
import type { ApplicationWithDocuments } from "@/types";

const APPLICANT_OR_BEYOND = ["APPLICANT", "APPROVED", "FUNDED", "REPAYING", "PAID_OFF"];

async function getDashboardData() {
  const [
    applications,
    contactMetrics,
    recentActivities,
    landingPages,
    totalLPs,
    publishedLPs,
    contactsForTracking,
  ] = await Promise.all([
    getApplications() as Promise<ApplicationWithDocuments[]>,
    getContactMetrics(),
    getRecentActivities(8),
    prisma.landingPage.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        slug: true,
        metaTitle: true,
        heroHeadlineLine1: true,
        published: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.landingPage.count(),
    prisma.landingPage.count({ where: { published: true } }),
    prisma.contact.findMany({
      select: { utmSource: true, utmCampaign: true, utmMedium: true, stage: true, createdAt: true },
    }),
  ]);

  const trackingBreakdown = (() => {
    const bySource = new Map<string, { total: number; converted: number }>();
    const byCampaign = new Map<string, { total: number; converted: number }>();
    const byMedium = new Map<string, { total: number; converted: number }>();

    for (const c of contactsForTracking) {
      const isConverted = APPLICANT_OR_BEYOND.includes(c.stage);
      const inc = (map: Map<string, { total: number; converted: number }>, key: string | null | undefined) => {
        const k = key && key.trim() ? key : "(direct)";
        const cur = map.get(k) || { total: 0, converted: 0 };
        cur.total += 1;
        if (isConverted) cur.converted += 1;
        map.set(k, cur);
      };
      inc(bySource, c.utmSource);
      inc(byCampaign, c.utmCampaign);
      inc(byMedium, c.utmMedium);
    }

    const toRows = (m: Map<string, { total: number; converted: number }>) =>
      Array.from(m.entries())
        .map(([key, v]) => ({ key, total: v.total, converted: v.converted }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);

    return { sources: toRows(bySource), campaigns: toRows(byCampaign), mediums: toRows(byMedium) };
  })();

  const lpLeadCounts = new Map<string, number>();
  for (const c of contactsForTracking) {
    if (c.utmCampaign) {
      lpLeadCounts.set(c.utmCampaign, (lpLeadCounts.get(c.utmCampaign) || 0) + 1);
    }
  }

  return {
    applications,
    contactMetrics,
    recentActivities: recentActivities.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      contact: a.contact,
    })),
    landingPages: landingPages.map((lp) => ({
      ...lp,
      publishedAt: lp.publishedAt?.toISOString() || null,
      updatedAt: lp.updatedAt.toISOString(),
      leadCount: lpLeadCounts.get(lp.slug) || 0,
    })),
    lpStats: { total: totalLPs, published: publishedLPs },
    trackingBreakdown,
    topSource: trackingBreakdown.sources[0] || null,
  };
}

export default async function AdminDashboardPage() {
  const data = await getDashboardData();
  return <DashboardClient {...data} />;
}

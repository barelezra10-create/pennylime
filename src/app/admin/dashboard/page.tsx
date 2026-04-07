import { getApplications } from "@/actions/applications";
import { getContactMetrics } from "@/actions/contacts";
import { getRecentActivities } from "@/actions/activities";
import { DashboardClient } from "./dashboard-client";
import type { ApplicationWithDocuments } from "@/types";

export default async function AdminDashboardPage() {
  const [applications, contactMetrics, recentActivities] = await Promise.all([
    getApplications() as Promise<ApplicationWithDocuments[]>,
    getContactMetrics(),
    getRecentActivities(10),
  ]);

  return (
    <DashboardClient
      applications={applications}
      contactMetrics={contactMetrics}
      recentActivities={recentActivities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        contact: a.contact,
      }))}
    />
  );
}

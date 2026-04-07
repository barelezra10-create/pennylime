import { getEmailMetrics } from "@/actions/email";
import { EmailDashboardClient } from "./email-dashboard-client";

export default async function EmailPage() {
  const metrics = await getEmailMetrics();
  return <EmailDashboardClient metrics={metrics} />;
}

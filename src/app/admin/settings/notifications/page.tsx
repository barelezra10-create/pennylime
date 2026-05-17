import { getNotificationConfig } from "@/actions/notifications";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const config = await getNotificationConfig();
  return <NotificationsClient initial={config} />;
}

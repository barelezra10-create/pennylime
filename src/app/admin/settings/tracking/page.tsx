import { getTrackingConfig } from "@/lib/tracking/config";
import { getRecentTrackingEvents } from "@/actions/tracking";
import { goachEnv } from "@/lib/payment-processor";
import { TrackingClient } from "./tracking-client";

export const dynamic = "force-dynamic";

export default async function TrackingSettingsPage() {
  const [config, recentEvents] = await Promise.all([
    getTrackingConfig(),
    getRecentTrackingEvents(25),
  ]);

  const goachConfigured = goachEnv() !== null;

  return (
    <TrackingClient
      config={config}
      goachConfigured={goachConfigured}
      recentEvents={recentEvents.map((e: Awaited<ReturnType<typeof getRecentTrackingEvents>>[number]) => ({
        id: e.id,
        eventName: e.eventName,
        contactId: e.contactId,
        pennyClickId: e.pennyClickId,
        clickIds: e.clickIds,
        value: e.value ? Number(e.value) : null,
        currency: e.currency,
        status: e.status,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}

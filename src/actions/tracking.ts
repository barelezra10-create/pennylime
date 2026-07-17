"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { updateTrackingConfig } from "@/lib/tracking/config";

const ALLOWED_FIELDS = [
  "googleAdsConversionId",
  "googleAdsDeveloperToken",
  "googleAdsCustomerId",
  "googleAdsLoginCustomerId",
  "googleAdsRefreshToken",
  "googleAdsClientId",
  "googleAdsClientSecret",
  "ga4MeasurementId",
  "ga4ApiSecret",
  "metaPixelId",
  "metaConversionsApiToken",
  "metaTestEventCode",
  "metaAdAccountId",
  "tiktokPixelId",
  "tiktokAccessToken",
  "tiktokTestEventCode",
  "microsoftUetTagId",
  "microsoftConversionsApiToken",
  "twilioAccountSid",
  "twilioAuthToken",
  "twilioFromNumber",
  "twilioMessagingServiceSid",
  "twilioVerifyServiceSid",
  "twilioTwimlAppSid",
  "twilioApiKeySid",
  "twilioApiKeySecret",
  "eventMappings",
  "customHeadHtml",
  "customBodyHtml",
  "paymentProcessor",
] as const;

const BOOL_FIELDS = ["enabled", "testMode"] as const;

export async function saveTrackingConfig(formData: FormData) {
  const data: Record<string, unknown> = {};

  for (const f of ALLOWED_FIELDS) {
    const v = formData.get(f);
    if (typeof v === "string") {
      data[f] = v.trim() ? v.trim() : null;
    }
  }

  for (const f of BOOL_FIELDS) {
    data[f] = formData.get(f) === "on";
  }

  // Safety guard: if GoACH is requested but env is not configured, silently
  // fall back to "increase" so the daily cron never marks all due payments FAILED.
  if (data.paymentProcessor === "goach") {
    const { goachEnv } = await import("@/lib/payment-processor");
    if (!goachEnv()) {
      data.paymentProcessor = "increase";
    }
  }

  await updateTrackingConfig(data);
  revalidatePath("/admin/settings/tracking");
  revalidatePath("/", "layout");
}

export async function getRecentTrackingEvents(limit = 25) {
  return prisma.trackingEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

import "server-only";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";
import { parseMappings } from "@/lib/tracking/event-mappings";
import { uploadClickConversion } from "@/lib/tracking/google-ads";
import { sendMetaEvent } from "@/lib/tracking/meta-capi";
import { sendTikTokEvent } from "@/lib/tracking/tiktok-events";
import { sendMicrosoftConversion } from "@/lib/tracking/microsoft-conversions";
import type { Platform, TrackingEventName } from "@/lib/tracking/click-ids";

type FireResult = Partial<Record<Platform, { status: "sent" | "skipped" | "failed"; error?: string }>>;

export async function fireServerEvent(opts: {
  eventName: TrackingEventName | string;
  contactId?: string;
  applicationId?: string;
  value?: number;
  currency?: string;
}): Promise<FireResult> {
  const cfg = await getTrackingConfig();
  if (!cfg.enabled) {
    return { google_ads: { status: "skipped", error: "tracking disabled" } };
  }

  const mappings = parseMappings(cfg.eventMappings);
  const evtCfg = mappings[opts.eventName] || { perPlatform: {} };

  const contact = opts.contactId
    ? await prisma.contact.findUnique({
        where: { id: opts.contactId },
        include: { application: true },
      })
    : null;

  const application = opts.applicationId
    ? await prisma.application.findUnique({ where: { id: opts.applicationId } })
    : contact?.application || null;

  const pennyClick = contact?.pennyClickId
    ? await prisma.pennyClick.findUnique({ where: { id: contact.pennyClickId } })
    : null;

  const value = opts.value ?? (application ? Number(application.fundedAmount || application.loanAmount) : evtCfg.defaultValue ?? 0);
  const currency = opts.currency || "USD";
  const orderId = application?.applicationCode || contact?.id;

  // Click identifiers: prefer contact's stored click IDs; fall back to PennyClick first-touch
  const gclid = contact?.gclid || pennyClick?.firstGclid || pennyClick?.lastGclid || undefined;
  const gbraid = contact?.gbraid || pennyClick?.firstGbraid || undefined;
  const wbraid = contact?.wbraid || pennyClick?.firstWbraid || undefined;
  const fbclid = contact?.fbclid || pennyClick?.firstFbclid || pennyClick?.lastFbclid || undefined;
  const ttclid = contact?.ttclid || pennyClick?.firstTtclid || pennyClick?.lastTtclid || undefined;
  const msclkid = contact?.msclkid || pennyClick?.firstMsclkid || pennyClick?.lastMsclkid || undefined;

  const result: FireResult = {};

  // Google Ads
  const ga = evtCfg.perPlatform.google_ads;
  if (
    ga?.enabled &&
    ga.label &&
    cfg.googleAdsCustomerId &&
    cfg.googleAdsDeveloperToken &&
    cfg.googleAdsClientId &&
    cfg.googleAdsClientSecret &&
    cfg.googleAdsRefreshToken
  ) {
    if (gclid || gbraid || wbraid) {
      const r = await uploadClickConversion(
        {
          customerId: cfg.googleAdsCustomerId.replace(/-/g, ""),
          loginCustomerId: cfg.googleAdsLoginCustomerId?.replace(/-/g, "") || undefined,
          developerToken: cfg.googleAdsDeveloperToken,
          clientId: cfg.googleAdsClientId,
          clientSecret: cfg.googleAdsClientSecret,
          refreshToken: cfg.googleAdsRefreshToken,
        },
        {
          conversionActionId: ga.label, // assuming Bar puts the numeric action ID here for server-side
          gclid,
          gbraid,
          wbraid,
          conversionDateTime: new Date(),
          value: ga.valueOverride ?? value,
          currency,
          orderId,
        }
      );
      result.google_ads = r.ok ? { status: "sent" } : { status: "failed", error: r.error };
    } else {
      result.google_ads = { status: "skipped", error: "no gclid/gbraid/wbraid" };
    }
  } else {
    result.google_ads = { status: "skipped", error: "incomplete config" };
  }

  // Meta CAPI
  const meta = evtCfg.perPlatform.meta;
  if (meta?.enabled && meta.label && cfg.metaPixelId && cfg.metaConversionsApiToken) {
    const r = await sendMetaEvent(
      { pixelId: cfg.metaPixelId, accessToken: cfg.metaConversionsApiToken, testEventCode: cfg.metaTestEventCode || undefined },
      meta.label,
      {
        email: contact?.email,
        phone: contact?.phone || undefined,
        firstName: contact?.firstName,
        lastName: contact?.lastName || undefined,
        externalId: contact?.pennyClickId || undefined,
        fbclid,
        ipAddress: pennyClick?.firstIpAddress || undefined,
        userAgent: pennyClick?.firstUserAgent || undefined,
      },
      { value: meta.valueOverride ?? value, currency, orderId }
    );
    result.meta = r.ok ? { status: "sent" } : { status: "failed", error: r.error };
  } else {
    result.meta = { status: "skipped", error: "incomplete config or disabled" };
  }

  // TikTok Events API
  const tt = evtCfg.perPlatform.tiktok;
  if (tt?.enabled && tt.label && cfg.tiktokPixelId && cfg.tiktokAccessToken) {
    const r = await sendTikTokEvent(
      { pixelId: cfg.tiktokPixelId, accessToken: cfg.tiktokAccessToken, testEventCode: cfg.tiktokTestEventCode || undefined },
      tt.label,
      {
        email: contact?.email,
        phone: contact?.phone || undefined,
        externalId: contact?.pennyClickId || undefined,
        ttclid,
        ipAddress: pennyClick?.firstIpAddress || undefined,
        userAgent: pennyClick?.firstUserAgent || undefined,
      },
      { value: tt.valueOverride ?? value, currency, orderId }
    );
    result.tiktok = r.ok ? { status: "sent" } : { status: "failed", error: r.error };
  } else {
    result.tiktok = { status: "skipped", error: "incomplete config or disabled" };
  }

  // Microsoft offline conversion
  const ms = evtCfg.perPlatform.microsoft;
  if (ms?.enabled && ms.label && cfg.microsoftUetTagId) {
    const r = await sendMicrosoftConversion(
      { uetTagId: cfg.microsoftUetTagId, apiToken: cfg.microsoftConversionsApiToken },
      ms.label,
      msclkid,
      { value: ms.valueOverride ?? value, currency, orderId }
    );
    result.microsoft = r.ok ? { status: "sent" } : { status: "failed", error: r.error };
  } else {
    result.microsoft = { status: "skipped", error: "incomplete config or disabled" };
  }

  // Determine overall status for the log row
  const sentCount = Object.values(result).filter((r) => r?.status === "sent").length;
  const failedCount = Object.values(result).filter((r) => r?.status === "failed").length;
  const overallStatus = sentCount > 0 ? "sent" : failedCount > 0 ? "failed" : "skipped";

  await prisma.trackingEvent.create({
    data: {
      eventName: opts.eventName,
      contactId: opts.contactId || null,
      applicationId: opts.applicationId || null,
      pennyClickId: contact?.pennyClickId || null,
      clickIds: JSON.stringify({ gclid, gbraid, wbraid, fbclid, ttclid, msclkid }),
      payload: JSON.stringify({ value, currency, orderId, source: "server" }),
      platforms: JSON.stringify(result),
      value,
      currency,
      status: overallStatus,
      errorMessage: failedCount > 0 ? Object.entries(result).filter(([, v]) => v?.status === "failed").map(([k, v]) => `${k}: ${v?.error}`).join(" | ").slice(0, 500) : null,
    },
  });

  return result;
}

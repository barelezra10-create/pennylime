"use client";

import { readAttributionFromStorage } from "@/components/tracking/click-id-capture";
import type { TrackingEventName } from "@/lib/tracking/click-ids";
import type { EventMappings, PlatformMapping } from "@/lib/tracking/event-mappings";

type GtagFn = (...args: unknown[]) => void;
type FbqFn = (...args: unknown[]) => void;
type TtqFn = { track: (event: string, payload?: Record<string, unknown>) => void };
type UetqArr = unknown[];

declare global {
  interface Window {
    gtag?: GtagFn;
    fbq?: FbqFn;
    ttq?: TtqFn;
    uetq?: UetqArr;
    __plMappings?: EventMappings;
    __plPlatformIds?: {
      googleAdsConversionId?: string | null;
      ga4MeasurementId?: string | null;
      metaPixelId?: string | null;
      tiktokPixelId?: string | null;
      microsoftUetTagId?: string | null;
    };
  }
}

export type ClientEventPayload = {
  event: TrackingEventName | string;
  value?: number;
  currency?: string;
  contactEmail?: string;
};

const FALLBACK_FB: Record<string, string> = {
  lead_form_start: "InitiateCheckout",
  lead_submit: "Lead",
  application_complete: "CompleteRegistration",
  approved: "Subscribe",
  funded: "Purchase",
};

const FALLBACK_TT: Record<string, string> = {
  lead_form_start: "InitiateCheckout",
  lead_submit: "SubmitForm",
  application_complete: "CompleteRegistration",
  approved: "Subscribe",
  funded: "PlaceAnOrder",
};

function valueFor(pm: PlatformMapping | undefined, baseValue: number) {
  if (pm?.valueOverride != null) return pm.valueOverride;
  return baseValue;
}

export async function fireClientEvent(payload: ClientEventPayload) {
  if (typeof window === "undefined") return;

  const attribution = readAttributionFromStorage();
  const baseValue = payload.value ?? 0;
  const currency = payload.currency ?? "USD";
  const mappings = window.__plMappings || {};
  const ids = window.__plPlatformIds || {};
  const eventCfg = mappings[payload.event] || { perPlatform: {} };

  // Google Ads conversion
  try {
    const ga = eventCfg.perPlatform.google_ads;
    const enabled = ga?.enabled !== false;
    if (enabled && ids.googleAdsConversionId && ga?.label) {
      const v = valueFor(ga, baseValue);
      window.gtag?.("event", "conversion", {
        send_to: `${ids.googleAdsConversionId}/${ga.label}`,
        value: v,
        currency,
      });
    }
  } catch {}

  // GA4 event
  try {
    const ga4 = eventCfg.perPlatform.ga4;
    const enabled = ga4?.enabled !== false;
    if (enabled) {
      const eventName = ga4?.label || payload.event;
      window.gtag?.("event", eventName, {
        value: valueFor(ga4, baseValue),
        currency,
        event_category: "conversion",
      });
    }
  } catch {}

  // Meta
  try {
    const meta = eventCfg.perPlatform.meta;
    const enabled = meta?.enabled !== false;
    if (enabled && window.fbq) {
      const fbEvent = meta?.label || FALLBACK_FB[payload.event] || "Lead";
      window.fbq("track", fbEvent, { value: valueFor(meta, baseValue), currency });
    }
  } catch {}

  // TikTok
  try {
    const tt = eventCfg.perPlatform.tiktok;
    const enabled = tt?.enabled !== false;
    if (enabled && window.ttq) {
      const ttEvent = tt?.label || FALLBACK_TT[payload.event] || "SubmitForm";
      window.ttq.track(ttEvent, { value: valueFor(tt, baseValue), currency });
    }
  } catch {}

  // Microsoft / Bing UET
  try {
    const ms = eventCfg.perPlatform.microsoft;
    const enabled = ms?.enabled !== false;
    if (enabled) {
      window.uetq = window.uetq || [];
      window.uetq.push("event", ms?.label || payload.event, {
        event_category: "conversion",
        event_value: valueFor(ms, baseValue),
        currency,
      });
    }
  } catch {}

  // Server-side mirror
  try {
    await fetch("/api/tracking/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event: payload.event,
        value: baseValue,
        currency,
        contactEmail: payload.contactEmail,
        attribution,
      }),
    });
  } catch {
    // best effort
  }
}

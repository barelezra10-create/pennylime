"use client";

import { readAttributionFromStorage } from "@/components/tracking/click-id-capture";
import type { TrackingEventName } from "@/lib/tracking/click-ids";

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
  }
}

export type ClientEventPayload = {
  event: TrackingEventName;
  value?: number;
  currency?: string;
  contactEmail?: string;
};

/**
 * Fire a tracking event from the browser:
 *  - GA4 / Google Ads via gtag()
 *  - Meta via fbq()
 *  - TikTok via ttq.track()
 *  - Microsoft Bing via uetq.push()
 *  - Persists to /api/tracking/event so the server can mirror to APIs and log
 */
export async function fireClientEvent(payload: ClientEventPayload) {
  if (typeof window === "undefined") return;
  const attribution = readAttributionFromStorage();
  const value = payload.value ?? 0;
  const currency = payload.currency ?? "USD";

  const sharedParams = { value, currency, event_category: "conversion", event_label: payload.event };

  try {
    window.gtag?.("event", payload.event, sharedParams);
  } catch {}

  try {
    const fbEventMap: Record<string, string> = {
      lead_form_start: "InitiateCheckout",
      lead_submit: "Lead",
      application_complete: "CompleteRegistration",
      approved: "Subscribe",
      funded: "Purchase",
    };
    const fbEvent = fbEventMap[payload.event];
    if (fbEvent) window.fbq?.("track", fbEvent, { value, currency });
  } catch {}

  try {
    const ttEventMap: Record<string, string> = {
      lead_form_start: "InitiateCheckout",
      lead_submit: "SubmitForm",
      application_complete: "CompleteRegistration",
      approved: "Subscribe",
      funded: "PlaceAnOrder",
    };
    const ttEvent = ttEventMap[payload.event];
    if (ttEvent) window.ttq?.track(ttEvent, { value, currency });
  } catch {}

  try {
    window.uetq = window.uetq || [];
    window.uetq.push("event", payload.event, { event_category: "conversion", event_value: value, currency });
  } catch {}

  // Server-side mirror (logs + queues offline conversions)
  try {
    await fetch("/api/tracking/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event: payload.event,
        value,
        currency,
        contactEmail: payload.contactEmail,
        attribution,
      }),
    });
  } catch {
    // best effort
  }
}

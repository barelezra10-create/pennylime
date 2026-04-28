import type { Platform } from "@/lib/tracking/click-ids";

export type PlatformMapping = {
  enabled: boolean;
  label: string; // Google Ads conversion label, Meta standard event, TikTok event name, etc.
  valueOverride?: number | null;
};

export type EventConfig = {
  description?: string;
  defaultValue?: number;
  perPlatform: Partial<Record<Platform, PlatformMapping>>;
};

export type EventMappings = Record<string, EventConfig>;

export const PLATFORM_HINTS: Record<Platform, { labelHint: string; example: string }> = {
  google_ads: {
    labelHint: "Conversion label (after the slash in the conversion event snippet)",
    example: "aBC1deFgHi-J",
  },
  ga4: {
    labelHint: "GA4 event name",
    example: "generate_lead",
  },
  meta: {
    labelHint: "Standard event name",
    example: "Lead, Purchase, Subscribe, CompleteRegistration, InitiateCheckout",
  },
  tiktok: {
    labelHint: "TikTok standard event",
    example: "SubmitForm, CompleteRegistration, PlaceAnOrder, Subscribe",
  },
  microsoft: {
    labelHint: "Conversion goal name",
    example: "lead_submit_goal",
  },
};

export function parseMappings(raw: string): EventMappings {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object") return v as EventMappings;
  } catch {}
  return {};
}

export function defaultMappingFor(eventName: string): EventConfig {
  const fbEventMap: Record<string, string> = {
    lead_form_start: "InitiateCheckout",
    lead_submit: "Lead",
    application_complete: "CompleteRegistration",
    approved: "Subscribe",
    funded: "Purchase",
  };
  const ttEventMap: Record<string, string> = {
    lead_form_start: "InitiateCheckout",
    lead_submit: "SubmitForm",
    application_complete: "CompleteRegistration",
    approved: "Subscribe",
    funded: "PlaceAnOrder",
  };
  return {
    perPlatform: {
      google_ads: { enabled: true, label: "" },
      ga4: { enabled: true, label: eventName },
      meta: { enabled: true, label: fbEventMap[eventName] || "Lead" },
      tiktok: { enabled: true, label: ttEventMap[eventName] || "SubmitForm" },
      microsoft: { enabled: true, label: eventName },
    },
  };
}

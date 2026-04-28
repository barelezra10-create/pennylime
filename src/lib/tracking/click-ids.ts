export const CLICK_ID_PARAMS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"] as const;

export const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type ClickIds = Partial<Record<(typeof CLICK_ID_PARAMS)[number], string>>;
export type Utms = Partial<Record<(typeof UTM_PARAMS)[number], string>>;

export type AttributionData = ClickIds &
  Utms & {
    landingPage?: string;
    referrer?: string;
    capturedAt?: string;
  };

export const TRACKING_STORAGE_KEY = "pl_attribution";
export const TRACKING_TTL_DAYS = 90;

export const TRACKING_EVENTS = [
  "lead_form_start",
  "lead_submit",
  "application_complete",
  "approved",
  "funded",
] as const;

export type TrackingEventName = (typeof TRACKING_EVENTS)[number];

export const EVENT_DESCRIPTIONS: Record<TrackingEventName, string> = {
  lead_form_start: "User opened a landing-page lead form",
  lead_submit: "User submitted lead form (contact created)",
  application_complete: "User finished full /apply flow",
  approved: "Admin approved the loan (server-side, fires offline conversion)",
  funded: "Loan funded and disbursed (server-side, fires offline conversion)",
};

export const PLATFORMS = ["google_ads", "ga4", "meta", "tiktok", "microsoft"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  google_ads: "Google Ads",
  ga4: "GA4",
  meta: "Meta",
  tiktok: "TikTok",
  microsoft: "Microsoft Ads (Bing)",
};

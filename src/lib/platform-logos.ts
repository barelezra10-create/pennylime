/**
 * Per-platform brand logos and colors used on cash-advance pages.
 *
 * Resolution order:
 *   1. Simple Icons CDN (white logo on brand-color disc) — clean and
 *      consistent for the platforms they cover.
 *   2. Google Favicons (full-color logo on white disc) — fallback for
 *      everything Simple Icons doesn't have, like Shipt, Rover,
 *      TaskRabbit, GoPuff, Veho, Roadie, Favor, Wonolo. Coverage is
 *      ~100% because it just grabs the platform's own favicon.
 *   3. Colored initial badge (final fallback if both lookups fail).
 *
 * Adding a new platform via admin without updating this map gives the
 * favicon look automatically if we know the domain, or the initial
 * fallback otherwise.
 */

export type PlatformLogo = {
  /** Simple Icons slug. Null = skip Simple Icons, go straight to favicon. */
  simpleIconsSlug: string | null;
  /** Platform website domain (no protocol). Used for Google Favicons
   *  fallback. Set to null to skip the favicon and use the initial badge. */
  domain: string | null;
  /** Brand color hex (no #). Used for the brand-color disc + as the
   *  initial-badge background. */
  brandColor: string;
};

export const PLATFORM_LOGOS: Record<string, PlatformLogo> = {
  // Rideshare + delivery
  Uber: { simpleIconsSlug: "uber", domain: "uber.com", brandColor: "000000" },
  Lyft: { simpleIconsSlug: "lyft", domain: "lyft.com", brandColor: "FF00BF" },
  DoorDash: { simpleIconsSlug: "doordash", domain: "doordash.com", brandColor: "EF3340" },
  "Uber Eats": { simpleIconsSlug: null, domain: "ubereats.com", brandColor: "06C167" },
  // Grubhub, Turo, Walmart, Amazon slugs were removed from cdn.simpleicons.org —
  // fall back to Google Favicons so we don't ship broken images.
  Grubhub: { simpleIconsSlug: null, domain: "grubhub.com", brandColor: "F63440" },
  Instacart: { simpleIconsSlug: "instacart", domain: "instacart.com", brandColor: "43B02A" },
  "Amazon Flex": { simpleIconsSlug: null, domain: "flex.amazon.com", brandColor: "FF9900" },
  "Walmart Spark": { simpleIconsSlug: null, domain: "drive4spark.walmart.com", brandColor: "0071CE" },
  Postmates: { simpleIconsSlug: "postmates", domain: "postmates.com", brandColor: "000000" },

  // Marketplaces / freelance
  Fiverr: { simpleIconsSlug: "fiverr", domain: "fiverr.com", brandColor: "1DBF73" },
  Upwork: { simpleIconsSlug: "upwork", domain: "upwork.com", brandColor: "6FDA44" },
  Etsy: { simpleIconsSlug: "etsy", domain: "etsy.com", brandColor: "F16521" },
  eBay: { simpleIconsSlug: "ebay", domain: "ebay.com", brandColor: "E53238" },

  // Hosting / specialty
  Turo: { simpleIconsSlug: null, domain: "turo.com", brandColor: "593CFB" },

  // Creator platforms
  OnlyFans: { simpleIconsSlug: "onlyfans", domain: "onlyfans.com", brandColor: "00AFF0" },
  Patreon: { simpleIconsSlug: "patreon", domain: "patreon.com", brandColor: "FF424D" },
  Twitch: { simpleIconsSlug: "twitch", domain: "twitch.tv", brandColor: "9146FF" },
  YouTube: { simpleIconsSlug: "youtube", domain: "youtube.com", brandColor: "FF0000" },

  // No Simple Icons brand — Google Favicons fallback (full-color on white disc)
  Shipt: { simpleIconsSlug: null, domain: "shipt.com", brandColor: "1A7F37" },
  Rover: { simpleIconsSlug: null, domain: "rover.com", brandColor: "00ADC4" },
  TaskRabbit: { simpleIconsSlug: null, domain: "taskrabbit.com", brandColor: "2EAD51" },
  Thumbtack: { simpleIconsSlug: null, domain: "thumbtack.com", brandColor: "009FD9" },
  GoPuff: { simpleIconsSlug: null, domain: "gopuff.com", brandColor: "8338EC" },
  Veho: { simpleIconsSlug: null, domain: "shipveho.com", brandColor: "1E40AF" },
  Roadie: { simpleIconsSlug: null, domain: "roadie.com", brandColor: "F59E0B" },
  Favor: { simpleIconsSlug: null, domain: "favordelivery.com", brandColor: "0EA5E9" },
  Wonolo: { simpleIconsSlug: null, domain: "wonolo.com", brandColor: "F97316" },
};

/**
 * Returns the Simple Icons URL for the platform's logo (white-on-brand
 * SVG), or null if Simple Icons doesn't have it.
 */
export function getPlatformSimpleIconUrl(platformName: string): string | null {
  const cfg = PLATFORM_LOGOS[platformName];
  if (!cfg?.simpleIconsSlug) return null;
  return `https://cdn.simpleicons.org/${cfg.simpleIconsSlug}/ffffff`;
}

/**
 * Returns the Google Favicons URL for a platform's domain, or null if
 * we don't know the domain. Used as the fallback when Simple Icons
 * doesn't have the brand. 128px is large enough to render crisply.
 */
export function getPlatformFaviconUrl(platformName: string): string | null {
  const cfg = PLATFORM_LOGOS[platformName];
  if (!cfg?.domain) return null;
  return `https://www.google.com/s2/favicons?domain=${cfg.domain}&sz=128`;
}

export function getPlatformBrandColor(platformName: string): string {
  const cfg = PLATFORM_LOGOS[platformName];
  return cfg?.brandColor ?? "15803d";
}

export function getPlatformInitial(platformName: string): string {
  const words = platformName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return platformName.slice(0, 2).toUpperCase();
}

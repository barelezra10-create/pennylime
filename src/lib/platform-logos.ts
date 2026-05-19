/**
 * Per-platform brand logos and colors used on cash-advance pages.
 *
 * Where Simple Icons (simpleicons.org) has the brand, we use their CDN
 * which serves a clean monochrome SVG with the platform's official
 * brand color. Where they don't, we fall back to a colored initial
 * badge driven by `fallbackColor`.
 *
 * If a new platform is added via the admin editor, it'll just render
 * the initial fallback until it's added here.
 */

export type PlatformLogo = {
  /** Simple Icons slug (lowercase, matches the platform name on their CDN).
   *  Set to null to force the initial-fallback rendering. */
  simpleIconsSlug: string | null;
  /** Brand color hex (no #). Used both for Simple Icons recolor and for
   *  the fallback badge background. */
  brandColor: string;
};

/**
 * Map by PlatformPage.platformName (must match the DB row exactly).
 */
export const PLATFORM_LOGOS: Record<string, PlatformLogo> = {
  // Rideshare + delivery — most have official Simple Icons
  Uber: { simpleIconsSlug: "uber", brandColor: "000000" },
  Lyft: { simpleIconsSlug: "lyft", brandColor: "FF00BF" },
  DoorDash: { simpleIconsSlug: "doordash", brandColor: "EF3340" },
  "Uber Eats": { simpleIconsSlug: "ubereats", brandColor: "06C167" },
  Grubhub: { simpleIconsSlug: "grubhub", brandColor: "F63440" },
  Instacart: { simpleIconsSlug: "instacart", brandColor: "43B02A" },
  "Amazon Flex": { simpleIconsSlug: "amazon", brandColor: "FF9900" },
  "Walmart Spark": { simpleIconsSlug: "walmart", brandColor: "0071CE" },
  Postmates: { simpleIconsSlug: "postmates", brandColor: "000000" },

  // Marketplaces / freelance
  Fiverr: { simpleIconsSlug: "fiverr", brandColor: "1DBF73" },
  Upwork: { simpleIconsSlug: "upwork", brandColor: "6FDA44" },
  Etsy: { simpleIconsSlug: "etsy", brandColor: "F16521" },
  eBay: { simpleIconsSlug: "ebay", brandColor: "E53238" },

  // Hosting / specialty
  Turo: { simpleIconsSlug: "turo", brandColor: "593CFB" },

  // Creator platforms
  OnlyFans: { simpleIconsSlug: "onlyfans", brandColor: "00AFF0" },
  Patreon: { simpleIconsSlug: "patreon", brandColor: "FF424D" },
  Twitch: { simpleIconsSlug: "twitch", brandColor: "9146FF" },
  YouTube: { simpleIconsSlug: "youtube", brandColor: "FF0000" },

  // No Simple Icons brand → fall back to initial badge with brand-ish color
  Shipt: { simpleIconsSlug: null, brandColor: "1A7F37" },
  Rover: { simpleIconsSlug: null, brandColor: "00ADC4" },
  TaskRabbit: { simpleIconsSlug: null, brandColor: "2EAD51" },
  Thumbtack: { simpleIconsSlug: null, brandColor: "009FD9" },
  GoPuff: { simpleIconsSlug: null, brandColor: "8338EC" },
  Veho: { simpleIconsSlug: null, brandColor: "1E40AF" },
  Roadie: { simpleIconsSlug: null, brandColor: "F59E0B" },
  Favor: { simpleIconsSlug: null, brandColor: "0EA5E9" },
  Wonolo: { simpleIconsSlug: null, brandColor: "F97316" },
};

/**
 * Returns the URL to the platform's logo (white-on-brand SVG from
 * Simple Icons) or null if the platform has no official icon.
 *
 * We render Simple Icons in WHITE on top of a brand-colored circle
 * to keep the visual consistent — single-color icon on a single-color
 * disc. Looks clean and avoids the parade-of-rainbows effect that
 * mixed full-color logos create.
 */
export function getPlatformLogoUrl(platformName: string): string | null {
  const cfg = PLATFORM_LOGOS[platformName];
  if (!cfg?.simpleIconsSlug) return null;
  // White icon, served as PNG via the recolor endpoint for transparency
  // safety on cached CDN edges that strip SVG mime sometimes.
  return `https://cdn.simpleicons.org/${cfg.simpleIconsSlug}/ffffff`;
}

export function getPlatformBrandColor(platformName: string): string {
  const cfg = PLATFORM_LOGOS[platformName];
  return cfg?.brandColor ?? "15803d"; // default to PennyLime green
}

export function getPlatformInitial(platformName: string): string {
  // First letter of each word, up to 2 chars. "Walmart Spark" → "WS".
  const words = platformName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return platformName.slice(0, 2).toUpperCase();
}

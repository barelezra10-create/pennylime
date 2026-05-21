/**
 * Derives a human-readable traffic source from UTM + referrer.
 * Priority: explicit UTM source > known-host referrer match > "(direct)".
 *
 * Returned label is used in the admin visitor table and the breakdown panels
 * so "(direct)" stops dominating when the visitor actually arrived from a
 * search engine or social network that just doesn't tag UTMs.
 */

type Hit = { label: string; medium: string };

const REFERRER_MAP: Array<{ pattern: RegExp; hit: Hit }> = [
  // Search engines
  { pattern: /(^|\.)google\./i, hit: { label: "Google", medium: "organic" } },
  { pattern: /(^|\.)bing\.com$/i, hit: { label: "Bing", medium: "organic" } },
  { pattern: /(^|\.)duckduckgo\.com$/i, hit: { label: "DuckDuckGo", medium: "organic" } },
  { pattern: /(^|\.)yandex\./i, hit: { label: "Yandex", medium: "organic" } },
  { pattern: /(^|\.)yahoo\.com$/i, hit: { label: "Yahoo", medium: "organic" } },
  { pattern: /(^|\.)ecosia\.org$/i, hit: { label: "Ecosia", medium: "organic" } },
  { pattern: /(^|\.)baidu\.com$/i, hit: { label: "Baidu", medium: "organic" } },
  // LLMs / AI tools
  { pattern: /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i, hit: { label: "ChatGPT", medium: "ai" } },
  { pattern: /(^|\.)claude\.ai$/i, hit: { label: "Claude", medium: "ai" } },
  { pattern: /(^|\.)perplexity\.ai$/i, hit: { label: "Perplexity", medium: "ai" } },
  { pattern: /(^|\.)gemini\.google\.com$/i, hit: { label: "Gemini", medium: "ai" } },
  { pattern: /(^|\.)copilot\.microsoft\.com$/i, hit: { label: "Copilot", medium: "ai" } },
  { pattern: /(^|\.)bing\.com\/chat/i, hit: { label: "Bing Copilot", medium: "ai" } },
  { pattern: /(^|\.)you\.com$/i, hit: { label: "You.com", medium: "ai" } },
  // Social
  { pattern: /(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com)$/i, hit: { label: "Facebook", medium: "social" } },
  { pattern: /(^|\.)instagram\.com$/i, hit: { label: "Instagram", medium: "social" } },
  { pattern: /(^|\.)(twitter\.com|x\.com|t\.co)$/i, hit: { label: "X (Twitter)", medium: "social" } },
  { pattern: /(^|\.)tiktok\.com$/i, hit: { label: "TikTok", medium: "social" } },
  { pattern: /(^|\.)reddit\.com$/i, hit: { label: "Reddit", medium: "social" } },
  { pattern: /(^|\.)linkedin\.com$/i, hit: { label: "LinkedIn", medium: "social" } },
  { pattern: /(^|\.)pinterest\.com$/i, hit: { label: "Pinterest", medium: "social" } },
  { pattern: /(^|\.)youtube\.com$/i, hit: { label: "YouTube", medium: "social" } },
  { pattern: /(^|\.)snapchat\.com$/i, hit: { label: "Snapchat", medium: "social" } },
  { pattern: /(^|\.)threads\.net$/i, hit: { label: "Threads", medium: "social" } },
  // Messaging
  { pattern: /(^|\.)(whatsapp\.com|web\.whatsapp\.com)$/i, hit: { label: "WhatsApp", medium: "messaging" } },
  { pattern: /(^|\.)t\.me$/i, hit: { label: "Telegram", medium: "messaging" } },
  { pattern: /(^|\.)discord\.com$/i, hit: { label: "Discord", medium: "messaging" } },
];

const UTM_LABEL_MAP: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  bing: "Bing",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  newsletter: "Newsletter",
  email: "Email",
};

export type DetectedSource = { label: string; medium: string };

export function detectSource(input: {
  utmSource?: string | null;
  referrer?: string | null;
}): DetectedSource {
  const { utmSource, referrer } = input;

  if (utmSource && utmSource.trim()) {
    const key = utmSource.trim().toLowerCase();
    return { label: UTM_LABEL_MAP[key] || utmSource.trim(), medium: "paid/utm" };
  }

  if (referrer) {
    try {
      const url = new URL(referrer);
      const hostPath = `${url.hostname}${url.pathname}`;
      for (const { pattern, hit } of REFERRER_MAP) {
        if (pattern.test(url.hostname) || pattern.test(hostPath)) {
          return hit;
        }
      }
      // Unknown referrer host — return the hostname itself
      return { label: url.hostname.replace(/^www\./, ""), medium: "referral" };
    } catch {
      // referrer wasn't a parseable URL
    }
  }

  return { label: "(direct)", medium: "direct" };
}

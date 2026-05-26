"use client";

import { useState } from "react";
import {
  getPlatformSimpleIconUrl,
  getPlatformFaviconUrl,
  getPlatformBrandColor,
  getPlatformInitial,
} from "@/lib/platform-logos";

/**
 * Brand badge for a platform with cascading fallback:
 *   1. Simple Icons (white on brand-color disc)
 *   2. DuckDuckGo icon (full color, high-res, on white disc)
 *   3. Google Favicons (full color, lower-res, on white disc)
 *   4. Colored initial badge
 *
 * Each tier falls through to the next on the img's onError event,
 * so a 404 or broken image from any CDN automatically moves to the
 * next source. The initial badge is the guaranteed-render fallback.
 *
 * Client component because we need onError to fire — server-render
 * doesn't know whether the image actually loaded.
 */
export function PlatformLogo({
  platformName,
  size = 48,
  className = "",
}: {
  platformName: string;
  size?: number;
  className?: string;
}) {
  const simpleIconUrl = getPlatformSimpleIconUrl(platformName);
  const faviconUrl = getPlatformFaviconUrl(platformName);
  const brandColor = getPlatformBrandColor(platformName);
  const initial = getPlatformInitial(platformName);

  // Build an ordered list of (tier, url) options. Lower tiers are
  // higher-quality. Skip tiers we don't have a source for.
  type Tier =
    | { kind: "simple-icons"; url: string }
    | { kind: "duckduckgo"; url: string }
    | { kind: "favicon"; url: string };
  const tiers: Tier[] = [];
  if (simpleIconUrl) tiers.push({ kind: "simple-icons", url: simpleIconUrl });
  // DuckDuckGo serves nicely-rendered high-res icons for any public
  // domain. Better source than Google's tiny 32x32 favicons.
  if (faviconUrl) {
    const domain = faviconUrl.match(/domain=([^&]+)/)?.[1];
    if (domain) {
      tiers.push({
        kind: "duckduckgo",
        url: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      });
    }
  }
  if (faviconUrl) tiers.push({ kind: "favicon", url: faviconUrl });

  const [tierIndex, setTierIndex] = useState(0);
  const active = tiers[tierIndex];

  // Final fallback — colored initial badge.
  if (!active) {
    return (
      <div
        className={`relative inline-flex items-center justify-center rounded-2xl shadow-sm overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size, backgroundColor: `#${brandColor}` }}
        aria-hidden
      >
        <span
          className="font-extrabold text-white tracking-[-0.02em]"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initial}
        </span>
      </div>
    );
  }

  // Layout differs per tier — Simple Icons is a monochrome on a brand
  // disc, the others are full-color on white.
  const isMono = active.kind === "simple-icons";
  const inset = isMono ? Math.round(size * 0.24) : Math.round(size * 0.16);
  const iconSize = size - inset * 2;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl shadow-sm overflow-hidden flex-shrink-0 ${
        isMono ? "" : "bg-white border border-[#e4e4e7]"
      } ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: isMono ? `#${brandColor}` : undefined,
      }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={active.url}
        alt={`${platformName} logo`}
        width={iconSize}
        height={iconSize}
        style={{ width: iconSize, height: iconSize, objectFit: "contain" }}
        onError={() => setTierIndex((i) => i + 1)}
      />
    </div>
  );
}

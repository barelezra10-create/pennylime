import {
  getPlatformSimpleIconUrl,
  getPlatformFaviconUrl,
  getPlatformBrandColor,
  getPlatformInitial,
} from "@/lib/platform-logos";

/**
 * Brand badge for a platform. Renders in one of three modes:
 *   1. Simple Icons available → white logo on a brand-color disc
 *   2. No Simple Icons but we know the domain → favicon on a white
 *      disc with a thin gray border (so it doesn't blend into the card)
 *   3. Unknown → colored initial badge
 *
 * Square disc; pass `size` for the px width/height.
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

  // Inset for Simple Icons (monochrome): ~24% safe area on each side
  const monoInset = Math.round(size * 0.24);
  const monoIconSize = size - monoInset * 2;
  // Inset for favicons (multicolor): smaller inset since favicons
  // already include their own padding.
  const faviconInset = Math.round(size * 0.16);
  const faviconIconSize = size - faviconInset * 2;

  // Mode 1: Simple Icons → white-on-brand-color disc.
  if (simpleIconUrl) {
    return (
      <div
        className={`relative inline-flex items-center justify-center rounded-2xl shadow-sm overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size, backgroundColor: `#${brandColor}` }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={simpleIconUrl}
          alt=""
          width={monoIconSize}
          height={monoIconSize}
          style={{ width: monoIconSize, height: monoIconSize }}
        />
      </div>
    );
  }

  // Mode 2: Google Favicon → full-color favicon on white disc.
  if (faviconUrl) {
    return (
      <div
        className={`relative inline-flex items-center justify-center rounded-2xl bg-white border border-[#e4e4e7] shadow-sm overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl}
          alt=""
          width={faviconIconSize}
          height={faviconIconSize}
          style={{ width: faviconIconSize, height: faviconIconSize, objectFit: "contain" }}
        />
      </div>
    );
  }

  // Mode 3: Colored initial badge — final fallback.
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

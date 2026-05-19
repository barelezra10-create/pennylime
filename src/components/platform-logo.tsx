import {
  getPlatformLogoUrl,
  getPlatformBrandColor,
  getPlatformInitial,
} from "@/lib/platform-logos";

/**
 * Single-color brand badge for a platform. Renders the platform's
 * official monochrome logo on a brand-color disc when Simple Icons
 * has it, or falls back to a colored initial badge.
 *
 * Always a square disc — pass `size` for the px width/height.
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
  const logoUrl = getPlatformLogoUrl(platformName);
  const brandColor = getPlatformBrandColor(platformName);
  const initial = getPlatformInitial(platformName);

  // Inline padding so the icon doesn't touch the disc edge. Ratio is
  // ~22% on each side which matches how app-icon glyphs are usually
  // safe-area inset.
  const inset = Math.round(size * 0.24);
  const iconSize = size - inset * 2;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl shadow-sm overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `#${brandColor}`,
      }}
      aria-hidden
    >
      {logoUrl ? (
        // Using <img> rather than next/image because Simple Icons
        // serves a recolored SVG-as-image that doesn't need next's
        // optimizer (which would error on the unusual URL shape).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={iconSize}
          height={iconSize}
          style={{ width: iconSize, height: iconSize }}
        />
      ) : (
        <span
          className="font-extrabold text-white tracking-[-0.02em]"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

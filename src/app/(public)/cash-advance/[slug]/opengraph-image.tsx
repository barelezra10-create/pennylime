import { ImageResponse } from "next/og";
import { getPlatformPageBySlug } from "@/actions/content";
import { getPlatformBrandColor } from "@/lib/platform-logos";

// Next picks this file up automatically and injects the generated URL
// into the page's <meta property="og:image"> + Twitter card.
//
// dynamic="force-dynamic" keeps OG image generation OFF the build
// path — without this, Next pre-bakes all 26+ platform OG images
// during next build, which adds several minutes per deploy. Now
// they're generated on-demand at first request and edge-cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "PennyLime cash advance for gig workers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function PlatformOgImage({
  params,
}: {
  params: { slug: string };
}) {
  const platform = await getPlatformPageBySlug(params.slug);
  const platformName = platform?.platformName ?? "Gig Workers";
  const headline = platform?.heroHeadline ?? `Cash advances for ${platformName} workers`;
  const brandColor = `#${getPlatformBrandColor(platformName)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          backgroundColor: "#fafaf7",
          backgroundImage:
            "linear-gradient(135deg, #f0fdf4 0%, #fafaf7 60%, #fafaf7 100%)",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Top row: brand pill + platform pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#0a0a0a",
            }}
          >
            Penny<span style={{ color: "#15803d" }}>Lime</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 14px",
              borderRadius: 999,
              backgroundColor: brandColor,
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {platformName}
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#0a0a0a",
            lineHeight: 1.05,
            marginTop: 56,
            maxWidth: 980,
          }}
        >
          {headline}
        </div>

        {/* Stats row + brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                fontSize: 28,
                fontWeight: 600,
                color: "#52525b",
              }}
            >
              <span style={{ color: "#0a0a0a", fontWeight: 800 }}>
                $500 to $10K
              </span>
              <span style={{ color: "#a1a1aa" }}>·</span>
              <span>No credit check</span>
              <span style={{ color: "#a1a1aa" }}>·</span>
              <span>Funded in 24h</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 22px",
              backgroundColor: "#15803d",
              color: "#ffffff",
              borderRadius: 14,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            Apply →
          </div>
        </div>

        {/* Bottom brand-color accent bar */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 12,
            backgroundColor: brandColor,
          }}
        />
      </div>
    ),
    { ...size },
  );
}

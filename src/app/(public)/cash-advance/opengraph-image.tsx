import { ImageResponse } from "next/og";
import { getPublishedPlatformPages } from "@/actions/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Cash advances for every gig platform — PennyLime";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function HubOgImage() {
  const platforms = await getPublishedPlatformPages();
  // Top platforms to show as chips in the OG image. Order chosen for
  // brand recognition + keyword coverage.
  const featured = [
    "Uber",
    "DoorDash",
    "Lyft",
    "Amazon Flex",
    "Instacart",
    "Grubhub",
    "OnlyFans",
    "Twitch",
    "YouTube",
    "Fiverr",
    "Upwork",
    "Etsy",
  ].filter((name) => platforms.some((p) => p.platformName === name));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          backgroundColor: "#fafaf7",
          backgroundImage:
            "linear-gradient(135deg, #f0fdf4 0%, #fafaf7 65%, #fafaf7 100%)",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 32,
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
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#0a0a0a",
            lineHeight: 1.05,
            marginTop: 56,
            maxWidth: 1000,
          }}
        >
          Cash advances for every gig platform
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 500,
            color: "#52525b",
            marginTop: 24,
            maxWidth: 980,
          }}
        >
          {platforms.length}+ supported · No credit check · Funded in as fast as 24 hours
        </div>

        {/* Platform chips grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 48,
            maxWidth: 1040,
          }}
        >
          {featured.map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 999,
                backgroundColor: "#ffffff",
                border: "1px solid #e4e4e7",
                color: "#0a0a0a",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {name}
            </div>
          ))}
        </div>

        {/* CTA + green accent bar */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 26px",
              backgroundColor: "#15803d",
              color: "#ffffff",
              borderRadius: 14,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            $500 to $10,000 · Apply →
          </div>
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 12,
            backgroundColor: "#15803d",
          }}
        />
      </div>
    ),
    { ...size },
  );
}

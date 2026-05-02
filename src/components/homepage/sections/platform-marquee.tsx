"use client";

type Platform = {
  name: string;
  // simple-icons CDN URL or iconify URL
  iconUrl?: string;
  // Stylized text fallback for brands not in any open-source icon set
  text?: string;
  textColor?: string;
  textWeight?: number;
  textStyle?: "normal" | "italic";
  textTracking?: string;
};

const NEUTRAL = "71717a";

const PLATFORMS: Platform[] = [
  { name: "Uber", iconUrl: `https://cdn.simpleicons.org/uber/${NEUTRAL}` },
  { name: "Lyft", iconUrl: `https://cdn.simpleicons.org/lyft/${NEUTRAL}` },
  { name: "DoorDash", iconUrl: `https://cdn.simpleicons.org/doordash/${NEUTRAL}` },
  { name: "Instacart", iconUrl: `https://cdn.simpleicons.org/instacart/${NEUTRAL}` },
  { name: "Amazon", iconUrl: `https://api.iconify.design/cib/amazon.svg?color=%23${NEUTRAL}` },
  { name: "Shopify", iconUrl: `https://cdn.simpleicons.org/shopify/${NEUTRAL}` },
  { name: "Etsy", iconUrl: `https://cdn.simpleicons.org/etsy/${NEUTRAL}` },
  { name: "Fiverr", iconUrl: `https://cdn.simpleicons.org/fiverr/${NEUTRAL}` },
  { name: "Upwork", iconUrl: `https://cdn.simpleicons.org/upwork/${NEUTRAL}` },
  { name: "Postmates", iconUrl: `https://cdn.simpleicons.org/postmates/${NEUTRAL}` },
  { name: "Thumbtack", iconUrl: `https://cdn.simpleicons.org/thumbtack/${NEUTRAL}` },
  // Stylized text fallbacks (no open-source SVG available)
  { name: "Grubhub", text: "Grubhub", textColor: "#71717a", textWeight: 800, textTracking: "-0.025em" },
  { name: "Amazon Flex", text: "amazon flex", textColor: "#71717a", textWeight: 700, textTracking: "-0.01em" },
  { name: "Turo", text: "Turo", textColor: "#71717a", textWeight: 800, textTracking: "-0.04em" },
  { name: "TaskRabbit", text: "TaskRabbit", textColor: "#71717a", textWeight: 700, textTracking: "-0.02em" },
  { name: "Rover", text: "rover", textColor: "#71717a", textWeight: 800, textTracking: "-0.025em" },
  { name: "Shipt", text: "shipt", textColor: "#71717a", textWeight: 800, textTracking: "-0.015em" },
];

export function PlatformMarquee() {
  // Duplicate for seamless loop
  const loop = [...PLATFORMS, ...PLATFORMS];

  return (
    <section
      aria-label="Platforms PennyLime supports"
      className="relative bg-white border-y border-[#e4e4e7] py-8 md:py-10"
    >
      <div className="max-w-6xl mx-auto px-6 mb-5">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#71717a]">
          We fund earners on every major platform
        </p>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />

        <div className="marquee-track flex items-center gap-12 md:gap-16 whitespace-nowrap">
          {loop.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className="shrink-0 h-8 md:h-9 flex items-center opacity-70 hover:opacity-100 transition-opacity"
              aria-label={p.name}
              title={p.name}
            >
              {p.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.iconUrl}
                  alt={p.name}
                  className="h-full w-auto"
                  loading="lazy"
                />
              ) : (
                <span
                  className="select-none"
                  style={{
                    color: p.textColor,
                    fontWeight: p.textWeight,
                    letterSpacing: p.textTracking,
                    fontStyle: p.textStyle,
                    fontSize: "20px",
                    fontFamily: "-apple-system, 'Helvetica Neue', Inter, sans-serif",
                  }}
                >
                  {p.text}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .marquee-track {
          width: max-content;
          animation: marquee-scroll 50s linear infinite;
        }
        @keyframes marquee-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

"use client";

const PLATFORMS = [
  { name: "Uber", slug: "uber" },
  { name: "Lyft", slug: "lyft" },
  { name: "DoorDash", slug: "doordash" },
  { name: "Instacart", slug: "instacart" },
  { name: "Amazon", slug: "amazon" },
  { name: "Grubhub", slug: "grubhub" },
  { name: "Shopify", slug: "shopify" },
  { name: "Etsy", slug: "etsy" },
  { name: "Fiverr", slug: "fiverr" },
  { name: "Upwork", slug: "upwork" },
  { name: "Turo", slug: "turo" },
  { name: "Postmates", slug: "postmates" },
];

export function PlatformMarquee() {
  // Duplicate the array so the marquee can loop seamlessly
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

      {/* Marquee strip */}
      <div className="relative overflow-hidden">
        {/* Left edge fade */}
        <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        {/* Right edge fade */}
        <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />

        <div className="marquee-track flex items-center gap-12 md:gap-16 whitespace-nowrap">
          {loop.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${p.slug}-${i}`}
              src={`https://cdn.simpleicons.org/${p.slug}/71717a`}
              alt={p.name}
              className="h-7 md:h-8 w-auto opacity-70 hover:opacity-100 transition-opacity shrink-0"
              loading="lazy"
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .marquee-track {
          width: max-content;
          animation: marquee-scroll 40s linear infinite;
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

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found — PennyLime",
  description:
    "The page you're looking for has moved or doesn't exist. Head back to the home page or start an application.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0fdf4] via-[#fafaf7] to-[#fafaf7] flex items-center justify-center px-5 py-12">
      <main className="max-w-2xl w-full text-center">
        {/* 4 [LIME] 4 with the lime mark replacing the zero */}
        <div className="flex items-center justify-center gap-2 md:gap-4 mb-8 select-none" aria-label="404">
          <span
            aria-hidden
            className="font-extrabold tracking-[-0.06em] text-[160px] md:text-[220px] leading-none text-[#0a0a0a]"
          >
            4
          </span>
          <span
            aria-hidden
            className="relative inline-flex items-center justify-center h-[140px] w-[140px] md:h-[200px] md:w-[200px] flex-shrink-0"
          >
            <Image
              src="/lime-mark-transparent.png"
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 200px, 140px"
              className="object-contain drop-shadow-[0_8px_24px_rgba(21,128,61,0.25)]"
            />
          </span>
          <span
            aria-hidden
            className="font-extrabold tracking-[-0.06em] text-[160px] md:text-[220px] leading-none text-[#0a0a0a]"
          >
            4
          </span>
        </div>

        <h1 className="text-[28px] md:text-[36px] font-extrabold tracking-[-0.03em] text-[#0a0a0a] mb-3">
          Looks like this page went sour
        </h1>
        <p className="text-[15px] md:text-[17px] text-[#52525b] max-w-md mx-auto leading-relaxed">
          We couldn&rsquo;t find what you&rsquo;re looking for. The link might be old, or you may have typed it slightly off.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[#15803d] text-white text-[15px] font-bold px-6 py-3.5 rounded-xl hover:bg-[#166534] transition-colors shadow-[0_8px_20px_-8px_rgba(21,128,61,0.5)]"
          >
            Back to homepage
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-white border-2 border-[#0a0a0a] text-[#0a0a0a] text-[15px] font-bold px-6 py-3 rounded-xl hover:bg-[#fafafa] transition-colors"
          >
            Apply for an advance
          </Link>
        </div>

        <div className="mt-10 pt-8 border-t border-[#e4e4e7]">
          <p className="text-[12px] uppercase tracking-[0.08em] text-[#71717a] font-bold mb-3">
            Looking for one of these?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { href: "/cash-advance", label: "All gig platforms" },
              { href: "/cash-advance/uber-drivers", label: "Uber" },
              { href: "/cash-advance/doordash-dashers", label: "DoorDash" },
              { href: "/cash-advance/amazon-flex-drivers", label: "Amazon Flex" },
              { href: "/blog", label: "Blog" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full bg-white border border-[#e4e4e7] px-3 py-1.5 text-[12px] font-semibold text-[#52525b] hover:border-[#15803d] hover:text-[#15803d] transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

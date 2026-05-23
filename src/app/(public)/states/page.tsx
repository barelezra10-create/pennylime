export const dynamic = "force-dynamic";

import Link from "next/link";
import { getPublishedStatePages } from "@/actions/content";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, cashAdvanceProductSchema } from "@/components/seo/json-ld";
import { generateMeta } from "@/lib/seo";
import { ContentCta } from "@/components/content/content-cta";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Cash Advances by State — PennyLime",
    description:
      "Find merchant cash advance options in your state. PennyLime serves gig workers and 1099 contractors in all 50 U.S. states with funding in as fast as 1 business day.",
  }) as Metadata;
}

export default async function StatesIndexPage() {
  const states = await getPublishedStatePages();
  const sorted = [...states].sort((a, b) => a.stateName.localeCompare(b.stateName));

  // Bucket states by first letter for an A-Z directory feel.
  const buckets = new Map<string, typeof sorted>();
  for (const s of sorted) {
    const k = s.stateName[0].toUpperCase();
    const arr = buckets.get(k) || [];
    arr.push(s);
    buckets.set(k, arr);
  }
  const letters = Array.from(buckets.keys()).sort();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <JsonLd data={cashAdvanceProductSchema()} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "States", href: "/states" }]} />

      <header className="mb-10">
        <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-black leading-tight">
          Cash advances in every U.S. state.
        </h1>
        <p className="text-[16px] text-[#71717a] mt-3 max-w-2xl">
          PennyLime serves gig workers and 1099 contractors across the country. Pick your state below to see local
          regulations, average advance sizes, and state-specific FAQs.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/apply"
            className="inline-block bg-[#15803d] text-white text-[14px] font-semibold px-5 py-2.5 rounded-lg hover:bg-[#166534]"
          >
            Apply now
          </Link>
          <Link href="/cash-advance" className="text-[13px] text-[#15803d] font-semibold hover:underline">
            Browse by platform →
          </Link>
        </div>
      </header>

      {/* A-Z jump nav */}
      <nav aria-label="Jump to letter" className="flex flex-wrap gap-1.5 mb-8 border-y border-[#e4e4e7] py-3">
        {letters.map((l) => (
          <a
            key={l}
            href={`#${l}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[12px] font-semibold text-[#15803d] hover:bg-[#f0fdf4]"
          >
            {l}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {letters.map((l) => (
          <section key={l} id={l}>
            <h2 className="text-[14px] font-bold uppercase tracking-[0.08em] text-[#15803d] mb-3">{l}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {buckets.get(l)!.map((s) => (
                <Link
                  key={s.id}
                  href={`/states/${s.slug}`}
                  className="group flex items-center justify-between rounded-lg border border-[#e4e4e7] bg-white px-3.5 py-2.5 hover:border-[#15803d] hover:bg-[#f0fdf4] transition-colors"
                >
                  <span className="text-[13px] font-medium text-[#0a0a0a] group-hover:text-[#15803d]">
                    {s.stateName}
                  </span>
                  <span className="text-[10px] font-mono text-[#a1a1aa] group-hover:text-[#15803d]">
                    {s.stateCode}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12">
        <ContentCta />
      </div>
    </div>
  );
}

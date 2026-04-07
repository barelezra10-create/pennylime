"use client";

import { useState } from "react";
import { JsonLd, faqSchema } from "@/components/seo/json-ld";

interface FaqEntry { question: string; answer: string; }

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!entries.length) return null;

  return (
    <section className="mt-12">
      <JsonLd data={faqSchema(entries)} />
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-4">Frequently Asked Questions</h2>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="border border-[#e4e4e7] rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-[14px] font-medium text-[#1a1a1a] hover:bg-[#f8faf8]"
            >
              {entry.question}
              <span className="text-[#71717a] text-[18px]">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-3 text-[14px] text-[#71717a] leading-relaxed">{entry.answer}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

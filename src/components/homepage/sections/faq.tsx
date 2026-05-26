"use client";

import { useState } from "react";
import { JsonLd, faqSchema } from "@/components/seo/json-ld";

const FAQ_ENTRIES = [
  {
    question: "What credit score do I need?",
    answer: "None. We don't pull your credit. We read 90 days of bank deposits to size the advance: how much you earn, how consistently, and from which platforms. A thin or rough credit file won't hold you back.",
  },
  {
    question: "How fast can I get funded?",
    answer: "Most applicants get a decision within 1 to 3 hours. Once approved, funds typically land in your bank within 24 to 48 hours. Same-day funding is available for standard bank accounts in many cases.",
  },
  {
    question: "What platforms do you support?",
    answer: "Drivers (Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, Shipt). Sellers (Amazon FBA, Shopify, Etsy). Operators (Fiverr, Upwork, TaskRabbit, Thumbtack, Rover). If you earn through any platform we haven't listed, apply anyway. We review every deposit source.",
  },
  {
    question: "What does it cost?",
    answer: "Your advance accrues a weekly rate of 4% to 10% (compounded on the outstanding balance), depending on your verified deposit history and risk profile. You pick the repayment term in weeks; the rate is the same regardless of term. No prepayment penalties, no hidden fees. Your total dollar cost and weekly payment are shown in plain dollars before you accept. This is a cash advance product, not a credit product, so there is no APR.",
  },
  {
    question: "How do I apply?",
    answer: "Click 'Get funded' from any page. The application takes about 5 minutes. You'll connect your bank securely through Plaid (read-only), upload a photo ID, and confirm a few details. That's it.",
  },
  {
    question: "Is it safe to link my bank?",
    answer: "Yes. Plaid uses bank-grade encryption and read-only access. We can only view deposits, never move money or initiate transactions on your behalf. Your bank credentials are never seen or stored by PennyLime.",
  },
  {
    question: "How does repayment work?",
    answer: "Repayment is a small fixed percentage of your future deposits, debited daily or weekly via ACH. Slow week, smaller remittance. Strong week, faster payoff. The percentage and total cost are disclosed in plain English before you accept.",
  },
];

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <JsonLd data={faqSchema(FAQ_ENTRIES)} />
      <section className="bg-[#fafaf7] py-16 md:py-24 px-5 md:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10 md:mb-12 text-center">
            <div className="inline-flex items-center gap-2 bg-white text-[#15803d] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase shadow-sm">
              FAQ
            </div>
            <h2
              className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a]"
              style={{ fontSize: "clamp(28px, 4.5vw, 56px)" }}
            >
              Common questions.
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ_ENTRIES.map((entry, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-[#e4e4e7] overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-5 md:px-6 py-5 text-left min-h-[64px]"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  <span className="font-bold text-[#1a1a1a] text-[15px] pr-4">
                    {entry.question}
                  </span>
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-[#dcfce7] flex items-center justify-center transition-transform duration-200"
                    style={{ transform: open === i ? "rotate(45deg)" : "rotate(0deg)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M6 1v10M1 6h10" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {open === i && (
                  <div className="px-5 md:px-6 pb-6">
                    <p className="text-[#52525b] text-[14px] leading-relaxed">
                      {entry.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-[#52525b] text-[14px] mt-10">
            Still have questions?{" "}
            <a
              href="mailto:info@pennylime.com"
              className="text-[#15803d] font-semibold hover:underline underline-offset-4"
            >
              Email our team
            </a>
          </p>
        </div>
      </section>
    </>
  );
}

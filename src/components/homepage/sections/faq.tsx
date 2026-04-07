"use client";

import { useState } from "react";
import { JsonLd, faqSchema } from "@/components/seo/json-ld";

const FAQ_ENTRIES = [
  {
    question: "What credit score do I need?",
    answer: "We don't check your credit score at all. We look at your platform earnings, how much you make, how consistently, and how long you've been active on your platform. A low or non-existent credit score won't hold you back.",
  },
  {
    question: "How fast can I get funded?",
    answer: "Most applicants get a decision within 1-3 hours. Once approved, funds typically land in your bank account within 24-48 hours. In some cases, same-day funding is available for standard bank accounts.",
  },
  {
    question: "What platforms do you support?",
    answer: "We support all major gig platforms including Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, Fiverr, Upwork, TaskRabbit, Shipt, and more. If you earn income through a platform we haven't listed, apply anyway, we review all gig income sources.",
  },
  {
    question: "What are the fees?",
    answer: "PennyLime charges a simple origination fee, no prepayment penalties, no hidden fees. Your total cost is shown clearly before you accept any loan. APR ranges from 30-60% depending on your loan amount, term, and earnings history.",
  },
  {
    question: "How do I apply?",
    answer: "Click 'Apply Now' from any page. The application takes about 5 minutes. You'll need to verify your platform account (we use a secure read-only connection), provide your bank account details, and confirm your identity. That's it.",
  },
  {
    question: "Is it safe to connect my platform account?",
    answer: "Yes. We use bank-grade encryption and read-only access, we can only view your earnings data, never make changes to your account or initiate payments on your behalf. Your credentials are never stored on our servers.",
  },
];

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <JsonLd data={faqSchema(FAQ_ENTRIES)} />
      <section className="bg-[#faf8f0] py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 bg-white text-[#15803d] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase shadow-sm">
              FAQ
            </div>
            <h2
              className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a]"
              style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}
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
                  className="w-full flex items-center justify-between px-6 py-5 text-left"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  <span className="font-bold text-[#1a1a1a] text-[15px] pr-4">
                    {entry.question}
                  </span>
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-[#f0f5f0] flex items-center justify-center transition-transform duration-200"
                    style={{ transform: open === i ? "rotate(45deg)" : "rotate(0deg)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M6 1v10M1 6h10" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {open === i && (
                  <div className="px-6 pb-6">
                    <p className="text-[#71717a] text-[14px] leading-relaxed">
                      {entry.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-[#71717a] text-[14px] mt-10">
            Still have questions?{" "}
            <a
              href="mailto:support@pennylime.com"
              className="text-[#15803d] font-semibold hover:underline"
            >
              Email our team
            </a>
          </p>
        </div>
      </section>
    </>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import { acceptOffer } from "@/actions/offers";

type Term = {
  weeklyRemittance: number;
  durationWeeks: number;
  disbursedAmount: number;
  totalCostOfCapital: number;
  processingFee: number;
  isRecommended: boolean;
};

type InitialOffer = {
  ok: true;
  firstName: string;
  lastName: string;
  status: "OFFERED" | "ACCEPTED" | "DECLINED";
  minAmount: number;
  maxAmount: number;
  terms: Term[];
  acceptedAmount: number | null;
  acceptedTermIndex: number | null;
  acceptedAt: string | null;
};

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OfferClient({
  applicationCode,
  token,
  initial,
}: {
  applicationCode: string;
  token: string;
  initial: InitialOffer;
}) {
  const [amount, setAmount] = useState<number>(initial.maxAmount);
  const [selectedTerm, setSelectedTerm] = useState<number>(
    initial.terms.findIndex((t) => t.isRecommended) >= 0
      ? initial.terms.findIndex((t) => t.isRecommended)
      : 0
  );
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(initial.status === "ACCEPTED");

  if (accepted || initial.status === "ACCEPTED") {
    return (
      <SuccessScreen
        firstName={initial.firstName}
        amount={initial.acceptedAmount ?? amount}
      />
    );
  }

  async function handleAccept() {
    setSubmitting(true);
    try {
      const r = await acceptOffer({
        applicationCode,
        token,
        selectedAmount: amount,
        selectedTermIndex: selectedTerm,
      });
      if (r.ok) {
        toast.success("Offer accepted! Funds are on the way.");
        setAccepted(true);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fafaf7]">
      {/* Top header */}
      <header className="bg-[#15803d] text-white py-6 px-5 md:px-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-[12px] uppercase tracking-[0.08em] text-white/70 font-semibold">PennyLime</p>
          <h1 className="mt-1 text-[28px] md:text-[34px] font-extrabold tracking-[-0.03em]">
            Congratulations, {initial.firstName}!
          </h1>
          <p className="mt-1 text-[15px] text-white/85">
            How much funding are you looking for?
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-12 py-8">
        {/* Amount slider */}
        <section className="bg-white rounded-2xl p-6 md:p-8">
          <div className="flex items-end justify-between mb-2">
            <span className="text-[44px] md:text-[56px] font-extrabold tracking-[-0.04em] text-[#0a0a0a] leading-none">
              ${amount.toLocaleString()}
            </span>
            <span aria-hidden className="text-3xl">👍</span>
          </div>
          <input
            type="range"
            min={initial.minAmount}
            max={initial.maxAmount}
            step={50}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-4 w-full accent-[#15803d]"
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#71717a] font-semibold">Start from</p>
              <p className="text-[14px] font-bold text-[#0a0a0a]">${initial.minAmount.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#71717a] font-semibold">Up to</p>
              <p className="text-[14px] font-bold text-[#0a0a0a]">${initial.maxAmount.toLocaleString()}</p>
            </div>
          </div>
        </section>

        {/* Repayment plans */}
        <section className="mt-8">
          <h2 className="text-center text-[20px] md:text-[24px] font-extrabold tracking-[-0.02em] text-[#0a0a0a]">
            Choose how you&rsquo;d like to repay your advance
          </h2>
          <p className="text-center mt-1 text-[13px] text-[#52525b]">
            Based on your cashflow and funding amount, we have the following offers:
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {initial.terms.map((t, idx) => (
              <PlanCard
                key={idx}
                term={t}
                amount={amount}
                selected={selectedTerm === idx}
                onSelect={() => setSelectedTerm(idx)}
              />
            ))}
          </div>
        </section>

        {/* Disclaimers */}
        <section className="mt-6 rounded-xl bg-[#f4f4f5] p-4 text-[12px] text-[#52525b] flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="text-[#15803d] font-bold">$</span>
            <span>This is a cash advance.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#0ea5e9] font-bold">÷</span>
            <span>The duration and total cost shown are based on your sales pattern.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#71717a] font-bold">*</span>
            <span>
              Disclaimer: Disbursed amount displayed does not include same day fees if option is selected.
            </span>
          </div>
        </section>

        {/* Accept button */}
        <div className="mt-8 sticky bottom-0 bg-[#fafaf7] py-4 -mx-5 px-5 md:relative md:bg-transparent md:p-0">
          <motion.button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="w-full rounded-xl bg-[#15803d] min-h-[56px] py-4 text-[16px] font-bold text-white transition-all hover:bg-[#166534] disabled:opacity-70 shadow-[0_8px_20px_-8px_rgba(21,128,61,0.5)]"
            whileTap={submitting ? {} : { scale: 0.98 }}
          >
            {submitting ? "Processing…" : `Accept ${fmt(amount)} advance`}
          </motion.button>
          <p className="mt-3 text-center text-[11px] text-[#71717a]">
            By accepting, you authorize ACH credit and weekly debits to your linked bank.
          </p>
        </div>
      </main>
    </div>
  );
}

function PlanCard({
  term,
  amount,
  selected,
  onSelect,
}: {
  term: Term;
  amount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  // Scale the displayed cost figures proportionally to the chosen amount,
  // assuming the term card's amount equals the disbursedAmount it was priced for.
  const ratio = term.disbursedAmount > 0 ? amount / term.disbursedAmount : 1;
  const weekly = Math.round(term.weeklyRemittance * ratio * 100) / 100;
  const disbursed = Math.round(term.disbursedAmount * ratio * 100) / 100;
  const totalCost = Math.round(term.totalCostOfCapital * ratio * 100) / 100;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-2xl border-2 p-5 transition-all ${
        selected
          ? "border-[#15803d] bg-white shadow-[0_4px_16px_-8px_rgba(21,128,61,0.4)]"
          : "border-[#e4e4e7] bg-white hover:border-[#a1a1aa]"
      }`}
    >
      {term.isRecommended && (
        <span className="absolute -top-2.5 right-5 inline-block bg-[#15803d] text-white text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-0.5 rounded-full">
          Recommended
        </span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[24px] font-extrabold tracking-[-0.02em] text-[#0a0a0a]">
            {fmt(weekly)}
            <span className="text-[14px] font-medium text-[#71717a]"> / Weekly Remittance</span>
          </p>
          <p className="mt-1 text-[13px] text-[#52525b]">
            Your estimated duration is {term.durationWeeks} weeks
          </p>
        </div>
        <div
          className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            selected ? "border-[#15803d] bg-[#15803d]" : "border-[#a1a1aa]"
          }`}
        >
          {selected && <CheckCircle className="h-3 w-3 text-white" />}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        className="mt-4 text-[13px] font-semibold text-[#15803d] hover:text-[#166534]"
      >
        {expanded ? "Less Details ▴" : "More Details ▾"}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          <Row label="Processing Fee" value={fmt(term.processingFee)} sub="Deducted from your funding amount." />
          <Row
            label="Disbursed Amount *"
            value={fmt(disbursed)}
            sub="Funds deposited to your account once processing fee is applied"
          />
          <Row
            label="Total Cost of Capital *"
            value={fmt(totalCost)}
            sub="Overall cost of your advance, including fees and charges."
          />
        </div>
      )}
    </button>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[15px] font-extrabold text-[#0a0a0a]">
        {value} <span className="text-[13px] font-medium text-[#52525b]">/ {label}</span>
      </p>
      <p className="text-[12px] text-[#71717a]">{sub}</p>
    </div>
  );
}

function SuccessScreen({ firstName, amount }: { firstName: string; amount: number }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] flex items-center justify-center px-4">
      <motion.div
        className="max-w-md w-full bg-white rounded-2xl p-8 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-[#15803d] flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
        </div>
        <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
          You&rsquo;re funded, {firstName}!
        </h1>
        <p className="mt-2 text-[14px] text-[#52525b]">
          ${amount.toLocaleString()} is on its way to your linked bank account. ACH transfers
          typically arrive within 1 business day.
        </p>
        <p className="mt-4 text-[12px] text-[#71717a]">
          Weekly remittances will start automatically next week.
        </p>
      </motion.div>
    </div>
  );
}

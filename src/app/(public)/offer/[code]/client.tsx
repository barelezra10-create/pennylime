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
  preferredChargeDay: number | null;
  bankName: string | null;
  bankAccountMask: string | null;
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
  // Two required consents — both must be checked to enable Accept.
  const [agreedToAgreement, setAgreedToAgreement] = useState(false);
  const [agreedToAch, setAgreedToAch] = useState(false);

  // Compute the schedule we're about to show the borrower for ACH auth.
  // Mirrors the server-side generateWeeklySchedule snap-to-charge-day
  // logic so what the borrower sees exactly matches what we create.
  function computeSchedule() {
    const term = initial.terms[selectedTerm];
    if (!term) return [];
    const weekly = Math.round(term.weeklyRemittance * (amount / Math.max(term.disbursedAmount, 1)) * 100) / 100;
    const firstDue = new Date();
    firstDue.setDate(firstDue.getDate() + 7);
    if (initial.preferredChargeDay != null) {
      const targetDay = initial.preferredChargeDay;
      const currentDay = firstDue.getDay();
      const diff = (targetDay - currentDay + 7) % 7;
      firstDue.setDate(firstDue.getDate() + diff);
    }
    const out: { paymentNumber: number; date: Date; amount: number }[] = [];
    for (let i = 0; i < term.durationWeeks; i++) {
      const due = new Date(firstDue);
      due.setDate(due.getDate() + 7 * i);
      out.push({ paymentNumber: i + 1, date: due, amount: weekly });
    }
    return out;
  }
  const schedule = computeSchedule();
  const totalDebit = schedule.reduce((s, p) => s + p.amount, 0);
  const bankLabel = initial.bankName
    ? `${initial.bankName}${initial.bankAccountMask ? " ending in " + initial.bankAccountMask : ""}`
    : "your linked bank account";

  const authorizationText = `I authorize PennyLime (770 Technology LLC) to ACH debit ${bankLabel} for ${schedule.length} weekly payments totaling ${fmt(totalDebit)}, on the dates above. This authorization remains in effect until the full amount has been delivered or I revoke it in writing by emailing info@pennylime.com at least 3 business days before the next scheduled debit.`;

  const canAccept = agreedToAgreement && agreedToAch && !submitting;

  if (accepted || initial.status === "ACCEPTED") {
    return (
      <SuccessScreen
        firstName={initial.firstName}
        amount={initial.acceptedAmount ?? amount}
      />
    );
  }

  async function handleAccept() {
    if (!agreedToAgreement || !agreedToAch) {
      toast.error("Please check both boxes to accept.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await acceptOffer({
        applicationCode,
        token,
        selectedAmount: amount,
        selectedTermIndex: selectedTerm,
        authorizationText,
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
        agreedToAgreement,
        agreedToAch,
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

        {/* ACH authorization & schedule */}
        <section className="mt-6 rounded-xl bg-white border border-[#e4e4e7] p-5 md:p-6">
          <h3 className="text-[15px] font-extrabold tracking-[-0.02em] text-[#0a0a0a] mb-1">
            Payment schedule & ACH authorization
          </h3>
          <p className="text-[12px] text-[#71717a] mb-4">
            Below is the exact debit schedule. Please review and authorize before accepting.
          </p>

          <div className="rounded-lg border border-[#e4e4e7] overflow-hidden mb-4">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafafa]">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#71717a]">#</th>
                  <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#71717a]">Date</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#71717a]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((p) => (
                  <tr key={p.paymentNumber} className="border-t border-[#f4f4f5]">
                    <td className="px-3 py-2 text-[#52525b]">{p.paymentNumber}</td>
                    <td className="px-3 py-2 text-[#0a0a0a] font-medium">
                      {p.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-right text-[#0a0a0a] font-semibold">{fmt(p.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#e4e4e7] bg-[#fafafa]">
                  <td colSpan={2} className="px-3 py-2.5 text-[13px] font-bold text-[#0a0a0a]">Total to be debited</td>
                  <td className="px-3 py-2.5 text-right text-[15px] font-extrabold text-[#0a0a0a]">{fmt(totalDebit)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-[#fafaf7] border border-[#e4e4e7] p-3.5 text-[12px] leading-relaxed text-[#52525b] mb-4">
            {authorizationText}
          </div>

          <label className="flex items-start gap-3 cursor-pointer py-2 select-none">
            <input
              type="checkbox"
              checked={agreedToAgreement}
              onChange={(e) => setAgreedToAgreement(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-[#a1a1aa] accent-[#15803d] cursor-pointer flex-shrink-0"
            />
            <span className="text-[13px] text-[#0a0a0a] leading-snug">
              I have read and agree to the{" "}
              <a href="/terms" target="_blank" className="text-[#15803d] underline font-semibold">Receivables Purchase and Sale Agreement</a>
              {" "}and the{" "}
              <a href="/disclosures" target="_blank" className="text-[#15803d] underline font-semibold">Cash Advance Disclosures</a>.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer py-2 select-none">
            <input
              type="checkbox"
              checked={agreedToAch}
              onChange={(e) => setAgreedToAch(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-[#a1a1aa] accent-[#15803d] cursor-pointer flex-shrink-0"
            />
            <span className="text-[13px] text-[#0a0a0a] leading-snug">
              I authorize PennyLime to ACH debit {bankLabel} according to the schedule above.
            </span>
          </label>
        </section>

        {/* Accept button */}
        <div className="mt-6 sticky bottom-0 bg-[#fafaf7] py-4 -mx-5 px-5 md:relative md:bg-transparent md:p-0">
          <motion.button
            type="button"
            onClick={handleAccept}
            disabled={!canAccept}
            className="w-full rounded-xl bg-[#15803d] min-h-[56px] py-4 text-[16px] font-bold text-white transition-all hover:bg-[#166534] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_8px_20px_-8px_rgba(21,128,61,0.5)]"
            whileTap={!canAccept ? {} : { scale: 0.98 }}
          >
            {submitting ? "Processing…" : `Accept & Authorize ${fmt(amount)} advance`}
          </motion.button>
          {!agreedToAgreement || !agreedToAch ? (
            <p className="mt-3 text-center text-[11px] text-[#a1a1aa]">
              Check both boxes above to enable.
            </p>
          ) : (
            <p className="mt-3 text-center text-[11px] text-[#15803d] font-semibold">
              ✓ Ready to accept. Your signature, IP, and timestamp will be recorded.
            </p>
          )}
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

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setOfferTerms, type OfferTerm } from "@/actions/offers";
import { computeAdvanceTerms } from "@/lib/cash-advance";

type ExistingOffer = {
  status: string;
  minAmount: number | null;
  maxAmount: number | null;
  terms: OfferTerm[];
  offerToken: string | null;
  applicationCode: string;
};

const blankTerm = (recommended = false): OfferTerm => ({
  weeklyRemittance: 0,
  durationWeeks: 0,
  disbursedAmount: 0,
  totalCostOfCapital: 0,
  processingFee: 0,
  isRecommended: recommended,
});

function buildDefaultTerms(principal: number, weeklyRate: number): OfferTerm[] {
  const weeks = [4, 6, 10];
  return weeks.map((termWeeks, idx) => {
    const t = computeAdvanceTerms({ principal, weeklyRate, termWeeks });
    return {
      weeklyRemittance: t.weeklyPayment,
      durationWeeks: t.termWeeks,
      disbursedAmount: t.principal,
      totalCostOfCapital: t.totalCostOfCapital,
      processingFee: 0,
      isRecommended: idx === 1,
    };
  });
}

export function SetOfferTermsForm({
  applicationId,
  existing,
}: {
  applicationId: string;
  existing: ExistingOffer;
}) {
  const [open, setOpen] = useState(existing.status === "PENDING");
  const [minAmount, setMinAmount] = useState<number>(existing.minAmount ?? 300);
  const [maxAmount, setMaxAmount] = useState<number>(existing.maxAmount ?? 2000);
  const [weeklyRate, setWeeklyRate] = useState<number>(5);
  const [genPrincipal, setGenPrincipal] = useState<number>(500);
  const [terms, setTerms] = useState<OfferTerm[]>(
    existing.terms.length > 0
      ? existing.terms
      : buildDefaultTerms(500, 5),
  );
  const [submitting, setSubmitting] = useState(false);
  const [savedToken, setSavedToken] = useState<string | null>(existing.offerToken);

  function regeneratePlans() {
    setTerms(buildDefaultTerms(genPrincipal, weeklyRate));
  }

  function updateTerm(idx: number, patch: Partial<OfferTerm>) {
    setTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function setRecommended(idx: number) {
    setTerms((prev) => prev.map((t, i) => ({ ...t, isRecommended: i === idx })));
  }

  function addTerm() {
    if (terms.length >= 3) return;
    setTerms((prev) => [...prev, blankTerm()]);
  }

  function removeTerm(idx: number) {
    if (terms.length <= 1) return;
    setTerms((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const r = await setOfferTerms({
        applicationId,
        offeredMinAmount: minAmount,
        offeredMaxAmount: maxAmount,
        terms,
      });
      if (r.ok) {
        setSavedToken(r.offerToken);
        toast.success("Offer saved. Share the link below with the applicant.");
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const offerUrl =
    savedToken && typeof window !== "undefined"
      ? `${window.location.origin}/offer/${existing.applicationCode}?t=${savedToken}`
      : null;

  if (!open) {
    return (
      <div className="bg-white rounded-[10px] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black">
              Offer:{" "}
              <span
                className={`uppercase tracking-wide text-xs px-2 py-0.5 rounded-full ${
                  existing.status === "ACCEPTED"
                    ? "bg-[#dcfce7] text-[#15803d]"
                    : existing.status === "OFFERED"
                    ? "bg-[#fef3c7] text-[#92400e]"
                    : "bg-[#f4f4f5] text-[#71717a]"
                }`}
              >
                {existing.status}
              </span>
            </h2>
            {existing.status === "OFFERED" && offerUrl && (
              <p className="mt-1 text-xs text-[#71717a] truncate max-w-[400px]" title={offerUrl}>
                {offerUrl}
              </p>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-[#15803d] hover:text-[#166534]"
          >
            {existing.status === "OFFERED" ? "Edit terms" : "Set terms"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[10px] p-6">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black">
          {existing.status === "OFFERED" ? "Edit offer terms" : "Set offer terms"}
        </h2>
        {existing.status !== "PENDING" && (
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-[#71717a] hover:text-black"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Range */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <FieldNum label="Min approved amount" value={minAmount} onChange={setMinAmount} />
        <FieldNum label="Max approved amount" value={maxAmount} onChange={setMaxAmount} />
      </div>

      {/* Generate plans from weekly rate */}
      <div className="border border-[#e4e4e7] bg-[#fafafa] rounded-lg p-3 mb-5">
        <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold mb-2">
          Auto-generate plans
        </p>
        <p className="text-[11px] text-[#71717a] mb-3">
          Cash advance, compounded weekly at the risk-adjusted rate. Generates 3 plans
          (4 / 6 / 10 weeks). Plans are editable below after generating.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <FieldNum
            label="Advance amount ($)"
            value={genPrincipal}
            onChange={setGenPrincipal}
          />
          <FieldNum
            label="Weekly rate (%)"
            value={weeklyRate}
            onChange={setWeeklyRate}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={regeneratePlans}
              className="w-full bg-[#15803d] text-white text-[12px] font-semibold rounded-lg px-3 py-2 hover:bg-[#166534]"
            >
              Generate plans
            </button>
          </div>
        </div>
      </div>

      {/* Terms */}
      <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold mb-2">
        Repayment plans (1-3)
      </p>
      <div className="flex flex-col gap-3">
        {terms.map((t, idx) => (
          <div key={idx} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#52525b]">Plan {idx + 1}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-[#52525b]">
                  <input
                    type="radio"
                    name="recommended"
                    checked={t.isRecommended}
                    onChange={() => setRecommended(idx)}
                  />
                  Recommended
                </label>
                {terms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTerm(idx)}
                    className="text-xs text-[#dc2626] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <FieldNum
                label="Weekly remittance"
                value={t.weeklyRemittance}
                onChange={(v) => updateTerm(idx, { weeklyRemittance: v })}
              />
              <FieldNum
                label="Duration (weeks)"
                value={t.durationWeeks}
                onChange={(v) => updateTerm(idx, { durationWeeks: v })}
              />
              <FieldNum
                label="Disbursed amount"
                value={t.disbursedAmount}
                onChange={(v) => updateTerm(idx, { disbursedAmount: v })}
              />
              <FieldNum
                label="Total cost of capital"
                value={t.totalCostOfCapital}
                onChange={(v) => updateTerm(idx, { totalCostOfCapital: v })}
              />
              <FieldNum
                label="Processing fee"
                value={t.processingFee}
                onChange={(v) => updateTerm(idx, { processingFee: v })}
              />
            </div>
          </div>
        ))}
        {terms.length < 3 && (
          <button
            type="button"
            onClick={addTerm}
            className="text-xs font-semibold text-[#15803d] hover:text-[#166534] self-start"
          >
            + Add another plan
          </button>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={submitting}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#15803d] text-white px-4 py-2 text-sm font-semibold hover:bg-[#166534] disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save offer terms"}
      </button>

      {offerUrl && (
        <div className="mt-5 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] p-3">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-semibold">
            Applicant offer link
          </p>
          <p className="mt-1 text-xs text-[#0a0a0a] break-all font-mono">{offerUrl}</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(offerUrl);
              toast.success("Link copied");
            }}
            className="mt-2 text-xs font-semibold text-[#15803d] hover:text-[#166534]"
          >
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}

function FieldNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.05em] text-[#71717a] font-semibold">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#15803d]/30 focus:border-[#15803d]"
      />
    </label>
  );
}

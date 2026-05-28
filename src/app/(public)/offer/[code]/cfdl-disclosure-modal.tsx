"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getCfdlDisclosurePreview, signCfdlDisclosure } from "@/actions/cfdl-disclosure";

type Props = {
  applicationId: string;
  selectedAmount: number;
  termWeeks: number;
  weeklyPayment: number;
  stateCode: string;
  onSigned: () => void;
  onCancel: () => void;
};

/**
 * State-specific Commercial Financing Disclosure modal. Required by
 * NY/CA/UT/VA/GA before the merchant can sign the RPSA. The merchant
 * must scroll to the bottom of the disclosure and type their full
 * legal name to sign. Persists a CfdlDisclosure row + PDF on submit.
 */
export function CfdlDisclosureModal({
  applicationId,
  selectedAmount,
  termWeeks,
  weeklyPayment,
  stateCode,
  onSigned,
  onCancel,
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    aprPercent: number;
    financeCharge: number;
    totalRepayment: number;
  } | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getCfdlDisclosurePreview({
        applicationId,
        selectedAmount,
        termWeeks,
        weeklyPayment,
      });
      if (cancelled) return;
      if (!r.ok) {
        toast.error(r.error);
        onCancel();
        return;
      }
      setHtml(r.html);
      setPreview({
        aprPercent: r.preview.aprPercent,
        financeCharge: r.preview.financeCharge,
        totalRepayment: r.preview.totalRepayment,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, selectedAmount, termWeeks, weeklyPayment, onCancel]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // 24px slop so users on small screens or with browser zoom can still
    // reach the bottom without pixel-perfect scrolling.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  }

  const nameValid = signedName.trim().split(/\s+/).filter(Boolean).length >= 2;

  async function handleSign() {
    if (!scrolledToEnd) {
      toast.error("Please scroll to the end of the disclosure first.");
      return;
    }
    if (!nameValid) {
      toast.error("Please type your full legal name (first and last) to sign.");
      return;
    }
    setSubmitting(true);
    const r = await signCfdlDisclosure({
      applicationId,
      selectedAmount,
      termWeeks,
      weeklyPayment,
      signedName: signedName.trim(),
      scrolledToBottom: true,
    });
    setSubmitting(false);
    if (r.ok) {
      toast.success("Disclosure signed. You may now accept the offer.");
      onSigned();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#e4e4e7] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold tracking-tight">
              {stateCode} Commercial Financing Disclosure
            </h2>
            <p className="text-[12px] text-[#71717a] mt-0.5">
              Required by {stateCode} state law before you sign the agreement.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-[12px] text-[#71717a] hover:text-black font-semibold"
          >
            Cancel
          </button>
        </div>

        {preview ? (
          <div className="px-6 py-3 bg-[#f0fdf4] border-b border-[#dcfce7] flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
            <span>
              <span className="text-[#71717a]">APR:</span>{" "}
              <strong className="text-[#15803d] tabular-nums">{preview.aprPercent.toFixed(2)}%</strong>
            </span>
            <span>
              <span className="text-[#71717a]">Total cost:</span>{" "}
              <strong className="text-[#15803d] tabular-nums">${preview.financeCharge.toFixed(2)}</strong>
            </span>
            <span>
              <span className="text-[#71717a]">Total payment:</span>{" "}
              <strong className="text-[#15803d] tabular-nums">${preview.totalRepayment.toFixed(2)}</strong>
            </span>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none"
        >
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="text-center py-8 text-[#a1a1aa] text-[13px]">
              Loading disclosure...
            </div>
          )}
          <div className="h-6" />
          {!scrolledToEnd && html ? (
            <p className="text-center text-[11px] text-[#a1a1aa] mt-4">
              Scroll to the bottom to enable signing.
            </p>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-[#e4e4e7] bg-[#fafafa]">
          <label className="block mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#71717a]">
              Type your full legal name to sign
            </span>
            <input
              type="text"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              disabled={!scrolledToEnd || submitting}
              placeholder="First Last"
              className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#15803d] disabled:bg-[#f4f4f5] disabled:opacity-60"
            />
          </label>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handleSign}
              disabled={!scrolledToEnd || !nameValid || submitting}
              className="flex-1 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[14px] font-semibold py-2.5 transition-colors disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Acknowledge disclosure and continue"}
            </button>
          </div>
          {!scrolledToEnd ? (
            <p className="text-[11px] text-[#71717a] mt-2 text-center">
              You must scroll to the bottom of the disclosure to sign.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

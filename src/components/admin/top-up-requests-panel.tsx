"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getTopUpRequestsForApplication, prepareTopUpOffer, sendTopUpContract, setTopUpRequestStatus, type AdminTopUpRow } from "@/actions/topup-admin";
import { buildTopUpTerm } from "@/lib/top-up-offer";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TopUpRequestsPanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<AdminTopUpRow[]>([]);
  const [error, setError] = useState(false);
  const router = useRouter();
  async function refresh() {
    setRows(await getTopUpRequestsForApplication(applicationId));
    router.refresh();
  }
  useEffect(() => {
    let active = true;
    getTopUpRequestsForApplication(applicationId).then(data => { if (active) setRows(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [applicationId]);
  if (error) return <p role="alert">Could not load top-up requests. Refresh the page to try again.</p>;
  if (!rows.length) return null;
  return (
    <section id="top-up-requests" className="order-first scroll-mt-28 bg-white rounded-xl border border-[#e4e4e7] p-6">
      <h2 className="text-[13px] font-bold text-black uppercase tracking-wide mb-2">Top-up requests</h2>
      <p className="mb-4 text-[12px] text-[#71717a]">Set terms for a separate advance, review the contract, then send it for the customer to sign. The existing advance keeps its own agreement and payments.</p>
      <div className="space-y-4">
        {rows.map(row => <TopUpCard key={`${row.id}-${row.offer?.offerToken}-${row.offer?.sentAt}-${row.status}`} row={row} refresh={refresh} />)}
      </div>
    </section>
  );
}

function TopUpCard({ row, refresh }: { row: AdminTopUpRow; refresh: () => Promise<void> }) {
  const offer = row.offer;
  const [amount, setAmount] = useState(String(offer?.amount ?? row.requestedAmount));
  const [rate, setRate] = useState(row.weeklyRate == null ? "" : String(row.weeklyRate));
  const [weeks, setWeeks] = useState(offer ? String(offer.durationWeeks) : "");
  const [busy, setBusy] = useState(false);
  const editable = ["PENDING", "APPROVED"].includes(row.status) && (!offer || (offer.status === "OFFERED" && !offer.sentAt));
  const dirty = !offer || Number(amount) !== offer.amount || Number(rate) !== row.weeklyRate || Number(weeks) !== offer.durationWeeks;
  let pricing: ReturnType<typeof buildTopUpTerm> | null = null;
  let validation = "Enter the weekly rate and repayment length.";
  if (amount.trim() && rate.trim() && weeks.trim()) {
    try { pricing = buildTopUpTerm({ amount: Number(amount), weeklyRate: Number(rate), durationWeeks: Number(weeks) }, row.requestedAmount); }
    catch (error) { validation = error instanceof Error ? error.message : "Check the terms."; }
  }
  async function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) { toast.error(result.error ?? "Could not complete this action."); return; }
      toast.success(message);
      await refresh();
    } catch { toast.error("Could not complete this action. Please refresh and try again."); }
    finally { setBusy(false); }
  }
  const state = row.status === "FUNDED" ? "Funded" : offer?.status === "ACCEPTED" ? "Signed" : offer && !["OFFERED", "ACCEPTED"].includes(offer.status) ? offer.status : offer?.sentAt ? "Contract sent" : offer ? "Prepared — not sent" : row.status;
  const inputClass = "mt-1 block w-full rounded-lg border border-[#d4d4d8] px-3 py-2 text-[13px] disabled:bg-[#fafafa]";
  const buttonClass = "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <div className="rounded-lg border border-[#e4e4e7] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div><p className="text-[18px] font-bold">{money(row.requestedAmount)} requested</p><p className="text-[11px] text-[#71717a]">{new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">{state}</span>
      </div>
      {(editable || offer) && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-[12px] font-medium">Top-up amount ($)<input aria-label="Top-up amount" type="number" min="0.01" max={row.requestedAmount} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} disabled={!editable || busy} className={inputClass} /></label>
          <label className="text-[12px] font-medium">Weekly rate (%) — compounded<input aria-label="Top-up weekly rate" type="number" min="0" max="100" step="0.01" placeholder="Enter rate" value={rate} onChange={e => setRate(e.target.value)} disabled={!editable || busy} className={inputClass} /></label>
          <label className="text-[12px] font-medium">Repayment length (weeks)<input aria-label="Top-up length in weeks" type="number" min="1" max="52" step="1" placeholder="Enter weeks" value={weeks} onChange={e => setWeeks(e.target.value)} disabled={!editable || busy} className={inputClass} /></label>
        </div>
        {pricing ? <div className="mt-3 rounded-lg bg-[#f0fdf4] p-3 text-[12px]" aria-live="polite">
          <strong>{pricing.durationWeeks} weekly payments of {money(pricing.weeklyRemittance)}</strong>
          <p>Total repayment: {money(pricing.weeklyRemittance * pricing.durationWeeks)} · Cost of capital: {money(pricing.totalCostOfCapital)} · Processing fee: $0.00</p>
        </div> : editable && <p className="mt-3 text-[12px] text-[#71717a]" aria-live="polite">{validation}</p>}
      </>}
      {row.adminNote && <p className="mt-3 text-[12px] text-[#52525b]">{row.adminNote}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editable && <button type="button" className={`${buttonClass} bg-[#15803d] text-white`} disabled={busy || !pricing || !dirty}
          onClick={() => run(() => prepareTopUpOffer({ requestId: row.id, amount: Number(amount), weeklyRate: Number(rate), durationWeeks: Number(weeks) }), "Top-up terms prepared. Review the contract before sending.")}>Save terms & prepare contract</button>}
        {offer?.offerToken && <a className={`${buttonClass} border border-[#d4d4d8]`} href={`/offer/${offer.applicationCode}?t=${offer.offerToken}&preview=1`} target="_blank" rel="noopener noreferrer">Review contract</a>}
        {offer?.status === "OFFERED" && <button type="button" className={`${buttonClass} bg-[#15803d] text-white`} disabled={busy || dirty}
          onClick={() => {
            if (!window.confirm(`${offer.sentAt ? "Resend" : "Send"} this top-up contract to the customer by email and SMS? The customer must sign before the normal funding flow starts.`)) return;
            run(() => sendTopUpContract(row.id), "Contract email sent.");
          }}>{busy ? "Working…" : offer.sentAt ? "Resend contract" : "Send contract"}</button>}
        {offer && <Link className={`${buttonClass} text-[#15803d]`} href={`/admin/applications/${offer.applicationId}`}>Open top-up advance</Link>}
        {row.status === "PENDING" && !offer && <button type="button" className={`${buttonClass} border border-red-200 text-red-700`} disabled={busy} onClick={() => {
          const note = window.prompt("Reason for declining (shown to customer):");
          if (note === null) return;
          run(() => setTopUpRequestStatus({ requestId: row.id, status: "DECLINED", adminNote: note || undefined }), "Top-up declined.");
        }}>Decline</button>}
      </div>
      {offer && dirty && editable && <p className="mt-2 text-[12px] text-amber-700">Save your changes before sending. The review link shows the last saved contract.</p>}
      {offer?.sentAt && <p className="mt-2 text-[11px] text-[#71717a]">Sent {new Date(offer.sentAt).toLocaleString()}. Sent contracts cannot be edited here.</p>}
    </div>
  );
}

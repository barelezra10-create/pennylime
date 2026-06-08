"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  chargePaymentNow,
  getPaymentsSummary,
  retryPayment,
  sendMissedPaymentNotice,
  waiveLateFee,
} from "@/actions/payments";
import { easternDayDiff } from "@/lib/eastern-time";

/**
 * Self-contained Payment Schedule card.
 *
 * Used by:
 *   - /admin/applications/[id] (full application detail page)
 *   - /admin/contacts/[id] (CRM contact view, when the contact has
 *     a linked application)
 *
 * Loads getPaymentsSummary on mount, auto-syncs against Increase
 * every 20s while any row is PROCESSING (same code path as the
 * manual Refresh button), and exposes the full set of admin
 * actions per row: Charge now / Refresh / Recharge / Email
 * borrower / Waive fee.
 */
export function PaymentScheduleCard({ applicationId }: { applicationId: string }) {
  const [paymentSummary, setPaymentSummary] = useState<Awaited<ReturnType<typeof getPaymentsSummary>> | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    getPaymentsSummary(applicationId).then(setPaymentSummary);
  }, [applicationId]);

  async function syncFromIncrease(): Promise<{ updated: number; total: number }> {
    if (!paymentSummary) return { updated: 0, total: 0 };
    const inflightIds = paymentSummary.payments
      .filter((p) => p.status === "PROCESSING")
      .map((p) => p.id);
    if (inflightIds.length === 0) return { updated: 0, total: 0 };
    setSyncingNow(true);
    try {
      const { refreshPaymentStatus } = await import("@/actions/refresh-payment-status");
      const results = await Promise.all(
        inflightIds.map((id) => refreshPaymentStatus(id).catch(() => null)),
      );
      const fresh = await getPaymentsSummary(applicationId);
      setPaymentSummary(fresh);
      setLastSyncAt(Date.now());
      const updated = results.filter(
        (r): r is { ok: true; status: string; transferStatus: string } =>
          !!r && r.ok && (r.status === "PAID" || r.status === "RETURNED"),
      ).length;
      return { updated, total: inflightIds.length };
    } finally {
      setSyncingNow(false);
    }
  }

  useEffect(() => {
    if (!paymentSummary) return;
    const hasInflight = paymentSummary.payments.some((p) => p.status === "PROCESSING");
    if (!hasInflight) return;
    let cancelled = false;
    void syncFromIncrease().catch(() => null);
    const handle = setInterval(() => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void syncFromIncrease().catch(() => null);
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, paymentSummary?.payments.length]);

  if (!paymentSummary) return null;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasInflight = paymentSummary.payments.some((p) => p.status === "PROCESSING");

  return (
    <div className="bg-white rounded-[10px] p-6 border border-[#e4e4e7]">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
          <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          Payment Schedule
        </h2>
        {hasInflight && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#71717a]">
              {syncingNow
                ? "Syncing with Increase…"
                : lastSyncAt
                ? `Last synced ${Math.max(1, Math.round((Date.now() - lastSyncAt) / 1000))}s ago · auto-syncs every 20s`
                : "Auto-sync every 20s"}
            </span>
            <button
              type="button"
              onClick={async () => {
                const r = await syncFromIncrease();
                if (r.updated > 0) {
                  toast.success(`Synced — ${r.updated} of ${r.total} now updated`);
                } else if (r.total > 0) {
                  toast.info(`Synced — Increase still says submitted for all ${r.total}`);
                }
              }}
              disabled={syncingNow}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white text-[#15803d] hover:bg-[#f0fdf4] disabled:opacity-60 text-[12px] font-semibold px-3 py-1.5 transition-colors"
            >
              <svg className={`h-3.5 w-3.5 ${syncingNow ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {syncingNow ? "Syncing" : "Sync from Increase"}
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Total Owed</p>
          <p className="text-xl font-bold text-black">${fmt(paymentSummary.totalOwed)}</p>
        </div>
        <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Total Paid</p>
          <p className="text-xl font-bold text-[#15803d]">${fmt(paymentSummary.totalPaid)}</p>
        </div>
        <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Remaining Balance</p>
          <p className="text-xl font-bold text-black">${fmt(paymentSummary.remainingBalance)}</p>
        </div>
        <div className="rounded-lg bg-[#fef9ec] p-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Total Late Fees</p>
          <p className="text-xl font-bold text-[#b45309]">${fmt(paymentSummary.totalLateFees)}</p>
        </div>
      </div>

      {/* Payment Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">#</th>
              <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Due Date</th>
              <th className="py-2.5 px-3 text-right text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Amount</th>
              <th className="py-2.5 px-3 text-right text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Principal</th>
              <th className="py-2.5 px-3 text-right text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Interest</th>
              <th className="py-2.5 px-3 text-right text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Late Fee</th>
              <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Status</th>
              <th className="py-2.5 px-3 text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentSummary.payments.map((payment) => {
              const statusColors: Record<string, string> = {
                PAID: "bg-[#f0f5f0] text-[#15803d]",
                PENDING: "bg-[#fef9ec] text-[#b45309]",
                FAILED: "bg-[#fff1f2] text-[#dc2626]",
                PROCESSING: "bg-[#eef4ff] text-[#2563eb]",
                LATE: "bg-[#fff1f2] text-[#dc2626]",
                COLLECTIONS: "bg-[#fff1f2] text-[#dc2626]",
                WAIVED: "bg-gray-100 text-[#a1a1aa]",
                RETURNED: "bg-[#fff1f2] text-[#dc2626]",
              };
              const badgeClass = statusColors[payment.status] ?? "bg-gray-100 text-[#a1a1aa]";
              const lateFee = Number(payment.lateFee);
              const isPaid = payment.status === "PAID";
              const isOverduePending =
                payment.status === "PENDING" &&
                easternDayDiff(new Date(payment.dueDate), new Date()) < 0;
              const canRecharge =
                payment.status === "FAILED" ||
                payment.status === "RETURNED" ||
                payment.status === "LATE" ||
                payment.status === "COLLECTIONS" ||
                isOverduePending;

              return (
                <tr key={payment.id} className="border-b border-gray-50 last:border-0 hover:bg-[#f8faf8] transition-colors">
                  <td className="py-2.5 px-3 text-black font-medium">{payment.paymentNumber}</td>
                  <td className="py-2.5 px-3 text-black">
                    {new Date(payment.dueDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-medium ${isPaid ? "text-[#15803d]" : "text-black"}`}>${fmt(Number(payment.amount))}</td>
                  <td className="py-2.5 px-3 text-right text-black">${fmt(Number(payment.principal))}</td>
                  <td className="py-2.5 px-3 text-right text-[#a1a1aa]">${fmt(Number(payment.interest))}</td>
                  <td className={`py-2.5 px-3 text-right font-medium ${lateFee > 0 ? "text-[#b45309]" : "text-[#a1a1aa]"}`}>
                    {lateFee > 0 ? `$${fmt(lateFee)}` : ","}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                      {payment.status}
                    </span>
                    {payment.status === "RETURNED" && (payment as any).increaseReturnReason && (
                      <p className="mt-1 text-[10px] text-[#dc2626] leading-tight max-w-[180px]">
                        {(payment as any).increaseReturnReason}
                      </p>
                    )}
                    {payment.status === "RETURNED" && !(payment as any).increaseReturnReason && (payment as any).increaseTransferStatus && (
                      <p className="mt-1 text-[10px] text-[#71717a] leading-tight">
                        Increase: {(payment as any).increaseTransferStatus}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {payment.status === "PENDING" && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Charge ${payment.paymentNumber === 1 ? "first" : "#" + payment.paymentNumber} payment of $${fmt(Number(payment.amount))} now via ACH debit?`)) return;
                            const result = await chargePaymentNow(payment.id);
                            if (result.success) {
                              toast.success(`ACH debit initiated for payment #${payment.paymentNumber}`);
                              getPaymentsSummary(applicationId).then(setPaymentSummary);
                            } else {
                              toast.error(result.error || "Failed to charge");
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#15803d] text-white px-2.5 py-1 text-xs font-semibold hover:bg-[#166534]"
                          title="ACH debit this payment now (instead of waiting for the daily cron)"
                        >
                          Charge now
                        </button>
                      )}
                      {payment.status === "PROCESSING" && (
                        <button
                          onClick={async () => {
                            const { refreshPaymentStatus } = await import("@/actions/refresh-payment-status");
                            const r = await refreshPaymentStatus(payment.id);
                            if (r.ok) {
                              toast.success(`Increase says: ${r.transferStatus}`);
                              getPaymentsSummary(applicationId).then(setPaymentSummary);
                            } else {
                              toast.error(r.error);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#15803d] bg-white text-[#15803d] px-2.5 py-1 text-xs font-semibold hover:bg-[#f0fdf4]"
                          title="Pull live status from Increase right now"
                        >
                          Refresh
                        </button>
                      )}
                      {canRecharge && (
                        <>
                          <button
                            onClick={async () => {
                              if (!confirm(`Recharge payment #${payment.paymentNumber} ($${fmt(Number(payment.amount) + lateFee)}) right now?`)) return;
                              const result = await retryPayment(payment.id);
                              if (result.success) {
                                toast.success(`Payment #${payment.paymentNumber} queued for recharge`);
                                getPaymentsSummary(applicationId).then(setPaymentSummary);
                              } else {
                                toast.error(result.error || "Failed to recharge payment");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#2563eb] bg-white px-2.5 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eef4ff] transition-colors"
                            title="Re-attempt the ACH debit through Increase right now"
                          >
                            Recharge now
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Email the borrower about missed payment #${payment.paymentNumber} and ask when to retry?`)) return;
                              const result = await sendMissedPaymentNotice(payment.id);
                              if (result.success) {
                                toast.success("Missed-payment email sent");
                              } else {
                                toast.error(result.error || "Failed to send email");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#15803d] bg-white px-2.5 py-1 text-xs font-semibold text-[#15803d] hover:bg-[#f0fdf4] transition-colors"
                            title="Email the borrower so they can reply with a date that works for them"
                          >
                            Email borrower
                          </button>
                        </>
                      )}
                      {lateFee > 0 && (
                        <button
                          onClick={async () => {
                            const result = await waiveLateFee(payment.id);
                            if (result.success) {
                              toast.success(`Late fee of $${fmt(result.waivedAmount ?? 0)} waived`);
                              getPaymentsSummary(applicationId).then(setPaymentSummary);
                            } else {
                              toast.error(result.error || "Failed to waive late fee");
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-[#b45309] hover:bg-[#fef9ec] transition-colors"
                        >
                          Waive Fee
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

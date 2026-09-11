"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getTopUpRequestsForApplication, setTopUpRequestStatus, type AdminTopUpRow } from "@/actions/topup-admin";

export function TopUpRequestsPanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminTopUpRow[] | null>(null);

  useEffect(() => {
    getTopUpRequestsForApplication(applicationId).then(setRows);
  }, [applicationId]);

  if (!rows) {
    return null;
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <div id="top-up-requests" className="order-first scroll-mt-28 bg-white rounded-xl border border-[#e4e4e7] p-6">
      <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em] mb-4">Top-up requests</h2>
      <p className="mb-4 text-[12px] text-[#71717a]">Approval records your decision. Funding must be arranged separately.</p>
      <div className="space-y-3">
        {rows.map((r) => {
          const created = new Date(r.createdAt);
          const isPending = r.status === "PENDING";
          const statusColor =
            r.status === "APPROVED" ? "bg-[#f0fdf4] text-[#15803d]" :
            r.status === "DECLINED" ? "bg-red-50 text-red-700" :
            r.status === "FUNDED" ? "bg-[#f0fdf4] text-[#15803d]" :
            "bg-amber-50 text-amber-800";
          return (
            <div key={r.id} className="rounded-lg border border-[#e4e4e7] p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[18px] font-bold text-black tabular-nums">
                    ${r.requestedAmount.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#71717a] mt-0.5">
                    requested {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor}`}>
                  {r.status}
                </span>
              </div>
              {r.adminNote && (
                <p className="mt-3 text-[12px] text-[#52525b] border-l-2 border-[#e4e4e7] pl-3">
                  {r.adminNote}
                </p>
              )}
              {r.reviewedBy && r.reviewedAt && (
                <p className="mt-2 text-[11px] text-[#a1a1aa]">
                  Reviewed by {r.reviewedBy} on {new Date(r.reviewedAt).toLocaleDateString()}
                </p>
              )}
              {isPending && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      const note = window.prompt("Optional note for the customer (leave blank to skip):");
                      if (note === null) return;
                      setBusy(r.id);
                      try {
                        const res = await setTopUpRequestStatus({ requestId: r.id, status: "APPROVED", adminNote: note || undefined });
                        if (res.ok) {
                          toast.success("Approved");
                          const fresh = await getTopUpRequestsForApplication(applicationId);
                          setRows(fresh);
                          router.refresh();
                        } else {
                          toast.error(res.error);
                        }
                      } catch {
                        toast.error("Could not save the decision. Please try again.");
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[12px] font-semibold px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      const note = window.prompt("Reason for declining (shown to customer):");
                      if (note === null) return;
                      setBusy(r.id);
                      try {
                        const res = await setTopUpRequestStatus({ requestId: r.id, status: "DECLINED", adminNote: note || undefined });
                        if (res.ok) {
                          toast.success("Declined");
                          const fresh = await getTopUpRequestsForApplication(applicationId);
                          setRows(fresh);
                          router.refresh();
                        } else {
                          toast.error(res.error);
                        }
                      } catch {
                        toast.error("Could not save the decision. Please try again.");
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-[12px] font-semibold px-3 py-1.5"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


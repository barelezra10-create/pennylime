"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAllPayments } from "@/actions/payments";
import { PageHeader } from "@/components/admin/page-header";

type PaymentWithApp = Awaited<ReturnType<typeof getAllPayments>>[number];

const statuses = ["ALL", "PENDING", "PROCESSING", "PAID", "FAILED", "LATE", "COLLECTIONS"];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PAID: "bg-[#f0f5f0] text-[#15803d]",
    PENDING: "bg-[#fef9ec] text-[#b45309]",
    PROCESSING: "bg-[#fef9ec] text-[#b45309]",
    FAILED: "bg-[#fff1f2] text-[#dc2626]",
    LATE: "bg-[#fff1f2] text-[#dc2626]",
    COLLECTIONS: "bg-[#fff1f2] text-[#dc2626]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${
        styles[status] || "bg-[#f4f4f5] text-[#71717a]"
      }`}
    >
      {status}
    </span>
  );
}

export function PaymentsClient() {
  const [payments, setPayments] = useState<PaymentWithApp[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    getAllPayments(filter).then((data) => {
      setPayments(data);
      setLoading(false);
    });
  }, [filter]);

  return (
    <div>
      <PageHeader title="Payments" description="View and manage all loan payments" />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
              filter === s
                ? "bg-[#1a1a1a] text-white"
                : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-[#a1a1aa]">Loading...</div>
      ) : payments.length === 0 ? (
        <div className="rounded-[10px] bg-white p-10 text-center">
          <p className="text-[#a1a1aa]">No payments found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#fafafa]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Borrower</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Late Fee</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Due Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Retries</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/admin/applications/${p.applicationId}`)}
                  className="cursor-pointer transition-colors hover:bg-[#f8f8f6]"
                >
                  <td className="px-4 py-3 font-mono text-black">{p.paymentNumber}</td>
                  <td className="px-4 py-3">
                    <span className="text-black">
                      {p.application.firstName} {p.application.lastName}
                    </span>
                    <span className="ml-2 text-[#a1a1aa]">{p.application.applicationCode}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-black">${Number(p.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#71717a]">
                    {Number(p.lateFee) > 0 ? `$${Number(p.lateFee).toFixed(2)}` : ","}
                  </td>
                  <td className="px-4 py-3 text-[#71717a]">{new Date(p.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-[#71717a]">{p.retryCount > 0 ? p.retryCount : ","}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

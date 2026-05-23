"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ApplicationWithDocuments } from "@/types";

function formatDate(date: Date) {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function toNum(v: number | string | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
}

export function ApplicationTable({
  applications,
}: {
  applications: ApplicationWithDocuments[];
}) {
  const router = useRouter();

  if (applications.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-stone-400"
          >
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-500">No applications found</p>
        <p className="text-xs text-stone-400 mt-1">
          Applications matching this filter will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Date
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Applicant
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Code
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Amount
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Repay
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Profit
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Platform
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Income
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Docs
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-4 py-3.5">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const requested = toNum(app.loanAmount);
            const funded = toNum(app.fundedAmount);
            const totalRepay = (app.payments || []).reduce((s, p) => s + toNum(p.amount), 0);
            const profit = funded > 0 && totalRepay > 0 ? totalRepay - funded : 0;
            return (
            <tr
              key={app.id}
              onClick={() => router.push(`/admin/applications/${app.id}`)}
              className="cursor-pointer hover:bg-[#f0f5f0] transition-colors duration-100"
            >
              <td className="px-4 py-3.5 text-sm text-stone-500 whitespace-nowrap">
                {formatDate(app.createdAt)}
              </td>
              <td className="px-4 py-3.5">
                <div className="text-sm font-medium text-stone-900">
                  {app.firstName} {app.lastName}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">{app.email}</div>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-xs font-mono text-stone-500 bg-stone-50 px-2 py-1 rounded-md">
                  {app.applicationCode}
                </span>
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <div className="text-sm font-medium text-stone-900">
                  {formatCurrency(requested)}
                </div>
                {funded > 0 ? (
                  <div className="text-xs text-[#15803d] mt-0.5">
                    Funded {formatCurrency(funded)}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                {totalRepay > 0 ? (
                  <span className="font-medium text-stone-900">{formatCurrency(totalRepay)}</span>
                ) : (
                  <span className="text-stone-300">,</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                {profit > 0 ? (
                  <span className="font-medium text-[#15803d]">{formatCurrency(profit)}</span>
                ) : (
                  <span className="text-stone-300">,</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-sm text-stone-500 whitespace-nowrap">
                {app.platform || ","}
              </td>
              <td className="px-4 py-3.5 text-sm text-stone-500 whitespace-nowrap">
                {app.monthlyIncome ? `$${Number(app.monthlyIncome).toLocaleString()}/mo` : ","}
              </td>
              <td className="px-4 py-3.5">
                <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-stone-400"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {app.documents.length}
                </span>
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={app.status} offerStatus={app.offerStatus} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

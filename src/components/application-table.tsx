"use client";

import { useRouter } from "next/navigation";
import type { ApplicationWithDocuments } from "@/types";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    APPROVED: {
      bg: "bg-[#f0f5f0]",
      text: "text-[#15803d]",
      dot: "bg-[#15803d]",
      label: "Approved",
    },
    REJECTED: {
      bg: "bg-[#fff1f2]",
      text: "text-[#dc2626]",
      dot: "bg-[#dc2626]",
      label: "Rejected",
    },
    PENDING: {
      bg: "bg-[#fef9ec]",
      text: "text-[#b45309]",
      dot: "bg-[#b45309]",
      label: "Pending",
    },
    ACTIVE: {
      bg: "bg-[#eef4ff]",
      text: "text-[#2563eb]",
      dot: "bg-[#2563eb]",
      label: "Active",
    },
    LATE: {
      bg: "bg-[#fff1f2]",
      text: "text-[#dc2626]",
      dot: "bg-[#dc2626]",
      label: "Late",
    },
    COLLECTIONS: {
      bg: "bg-[#fff1f2]",
      text: "text-[#dc2626]",
      dot: "bg-[#dc2626]",
      label: "Collections",
    },
    DEFAULTED: {
      bg: "bg-[#fff1f2]",
      text: "text-[#dc2626]",
      dot: "bg-[#dc2626]",
      label: "Defaulted",
    },
    PAID_OFF: {
      bg: "bg-[#f0f5f0]",
      text: "text-[#15803d]",
      dot: "bg-[#15803d]",
      label: "Paid Off",
    },
  };

  const c = config[status] ?? config.PENDING;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

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
    <div className="bg-white rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Date
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Applicant
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Code
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Amount
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Platform
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Income
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Docs
            </th>
            <th className="text-left text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-[0.05em] px-6 py-4">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr
              key={app.id}
              onClick={() => router.push(`/admin/applications/${app.id}`)}
              className="cursor-pointer hover:bg-[#f0f5f0] transition-colors duration-100"
            >
              <td className="px-6 py-4 text-sm text-stone-500 whitespace-nowrap">
                {formatDate(app.createdAt)}
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-stone-900">
                  {app.firstName} {app.lastName}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">{app.email}</div>
              </td>
              <td className="px-6 py-4">
                <span className="text-xs font-mono text-stone-500 bg-stone-50 px-2 py-1 rounded-md">
                  {app.applicationCode}
                </span>
              </td>
              <td className="px-6 py-4 text-sm font-medium text-stone-900 whitespace-nowrap">
                {formatCurrency(Number(app.loanAmount))}
              </td>
              <td className="px-6 py-4 text-sm text-stone-500 whitespace-nowrap">
                {app.platform || ","}
              </td>
              <td className="px-6 py-4 text-sm text-stone-500 whitespace-nowrap">
                {app.monthlyIncome ? `$${Number(app.monthlyIncome).toLocaleString()}/mo` : ","}
              </td>
              <td className="px-6 py-4">
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
              <td className="px-6 py-4">
                <StatusBadge status={app.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

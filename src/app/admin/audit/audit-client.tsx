"use client";

import { useState, useEffect } from "react";
import { getAuditLogs } from "@/actions/audit";
import { PageHeader } from "@/components/admin/page-header";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  details: string | null;
  createdAt: Date;
};

export default function AuditClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getAuditLogs({
        action: actionFilter || undefined,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setLoading(false);
    }
    load();
  }, [actionFilter]);

  const actions = [
    "APPROVE", "REJECT", "FUND", "EDIT_INCOME",
    "VIEW_SSN", "CHANGE_SETTING", "LOGIN", "WAIVE_FEE",
  ];

  return (
    <div>
      <PageHeader title="Audit Log" description={`${total} entries`} />

      {/* Action filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActionFilter("")}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
            !actionFilter ? "bg-[#1a1a1a] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
          }`}
        >
          All
        </button>
        {actions.map((action) => (
          <button
            key={action}
            onClick={() => setActionFilter(action)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
              actionFilter === action
                ? "bg-[#1a1a1a] text-white"
                : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
            }`}
          >
            {action}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-[#a1a1aa]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Time</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Action</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Entity</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">By</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-[#f8f8f6]">
                  <td className="px-4 py-3 text-[13px] text-[#a1a1aa]">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">
                    {log.entityType} / {log.entityId.substring(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{log.performedBy}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-[13px] text-[#a1a1aa]">
                    {log.details || ","}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

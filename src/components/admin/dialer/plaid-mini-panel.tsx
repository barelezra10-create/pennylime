"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PlaidSummary = {
  hasPlaid: boolean;
  institutionName: string | null;
  accountMask: string | null;
  bankBalance: number | null;
  availableBalance: number | null;
  monthlyIncome: number | null;
  avgWeeklyIncome: number | null;
  depositCadence: string | null;
  depositCount90d: number | null;
  lastPlaidRefresh: string | null;
  applicationId: string | null;
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Compact bank snapshot for the dialer — the rep sees balance + income
 * context for the contact they're about to call without opening the
 * full application. Data comes from the Plaid fields cached on the
 * contact's linked application.
 */
export function PlaidMiniPanel({ contactId }: { contactId: string }) {
  const [summary, setSummary] = useState<PlaidSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(false);
    fetch(`/api/admin/contacts/${encodeURIComponent(contactId)}/plaid-summary`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<PlaidSummary>;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (error) return null;

  if (!summary) {
    return (
      <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h3 className="text-[13px] font-bold text-black mb-2">Bank snapshot</h3>
        <p className="text-[12px] text-[#71717a]">Loading...</p>
      </div>
    );
  }

  if (!summary.hasPlaid) {
    return (
      <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h3 className="text-[13px] font-bold text-black mb-2">Bank snapshot</h3>
        <p className="text-[12px] text-[#a1a1aa]">
          No bank connected{summary.applicationId ? " for this application" : " — no linked application"}.
        </p>
        {summary.applicationId && (
          <Link
            href={`/admin/applications/${summary.applicationId}`}
            className="mt-1 inline-block text-[12px] text-[#2563eb] hover:underline"
          >
            Open application
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-white p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[13px] font-bold text-black">
          Bank snapshot
          <span className="ml-2 text-[11px] font-medium text-[#71717a]">
            {summary.institutionName || "Bank"}
            {summary.accountMask ? ` ••${summary.accountMask}` : ""}
          </span>
        </h3>
        {summary.applicationId && (
          <Link
            href={`/admin/applications/${summary.applicationId}`}
            className="text-[12px] text-[#2563eb] hover:underline whitespace-nowrap"
          >
            Open application
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a]">Balance</p>
          <p className="text-[15px] font-bold text-black tabular-nums">{fmtMoney(summary.bankBalance)}</p>
          {summary.availableBalance != null && (
            <p className="text-[10px] text-[#a1a1aa]">{fmtMoney(summary.availableBalance)} available</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a]">Monthly income</p>
          <p className="text-[15px] font-bold text-black tabular-nums">{fmtMoney(summary.monthlyIncome)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a]">Weekly avg</p>
          <p className="text-[15px] font-bold text-black tabular-nums">{fmtMoney(summary.avgWeeklyIncome)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a]">Deposits (90d)</p>
          <p className="text-[15px] font-bold text-black tabular-nums">
            {summary.depositCount90d ?? "—"}
            {summary.depositCadence && (
              <span className="ml-1 text-[11px] font-medium text-[#71717a] capitalize">{summary.depositCadence}</span>
            )}
          </p>
        </div>
      </div>

      {summary.lastPlaidRefresh && (
        <p className="mt-3 text-[10px] text-[#a1a1aa]">
          Last Plaid refresh: {new Date(summary.lastPlaidRefresh).toLocaleString()}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Browser-side auto-refresh for the portal dashboard so payment
 * status changes (PROCESSING -> PAID, app FUNDED -> REPAYING etc.)
 * surface without a manual reload.
 *
 * Calls router.refresh() every REFRESH_INTERVAL_MS, which re-fetches
 * the server component tree (force-dynamic) and re-renders any pieces
 * whose underlying data changed. Cheap when nothing changed (small
 * server hop + diff). Pauses when the tab is hidden so we don't burn
 * battery / quota on backgrounded tabs.
 */
const REFRESH_INTERVAL_MS = 30_000;

export function PortalAutoRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshedAt, setJustRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    }

    const handle = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [router]);

  async function handleManualRefresh() {
    setRefreshing(true);
    router.refresh();
    // Visual feedback — flash "Refreshed" then clear after a beat
    setTimeout(() => {
      setRefreshing(false);
      setJustRefreshedAt(Date.now());
      setTimeout(() => setJustRefreshedAt(null), 2500);
    }, 600);
  }

  return (
    <button
      type="button"
      onClick={handleManualRefresh}
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white text-[#52525b] hover:text-[#15803d] hover:border-[#15803d] text-[12px] font-semibold px-3 py-1.5 transition-colors disabled:opacity-60"
      title="Pull the latest payment status from our system"
    >
      <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      {refreshing ? "Refreshing" : justRefreshedAt ? "Refreshed" : "Refresh"}
    </button>
  );
}

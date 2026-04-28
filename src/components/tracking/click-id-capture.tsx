"use client";

import { useEffect } from "react";
import { CLICK_ID_PARAMS, UTM_PARAMS, TRACKING_STORAGE_KEY, TRACKING_TTL_DAYS, type AttributionData } from "@/lib/tracking/click-ids";

const PENNYCLICK_COOKIE = "_pl_clickid";
const VISIT_SENT_KEY = "_pl_visit_sent";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export function ClickIdCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const params = url.searchParams;

    let captured: AttributionData = {};
    try {
      const raw = window.localStorage.getItem(TRACKING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AttributionData;
        const age = parsed.capturedAt ? Date.now() - new Date(parsed.capturedAt).getTime() : Infinity;
        if (age < TRACKING_TTL_DAYS * 24 * 60 * 60 * 1000) {
          captured = parsed;
        }
      }
    } catch {
      // ignore corrupt storage
    }

    let updated = false;

    for (const key of CLICK_ID_PARAMS) {
      const v = params.get(key);
      if (v) {
        captured[key] = v;
        updated = true;
      }
    }

    for (const key of UTM_PARAMS) {
      const v = params.get(key);
      if (v) {
        captured[key] = v;
        updated = true;
      }
    }

    const pennyClickId = readCookie(PENNYCLICK_COOKIE);
    if (pennyClickId) {
      (captured as AttributionData & { pennyClickId?: string }).pennyClickId = pennyClickId;
    }

    captured.landingPage = url.pathname + url.search;
    captured.referrer = document.referrer || captured.referrer || "";
    captured.capturedAt = new Date().toISOString();

    try {
      window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(captured));
    } catch {
      // ignore quota errors
    }

    // Notify server once per page (and immediately on URL changes that brought new attribution)
    const visitKey = `${VISIT_SENT_KEY}:${url.pathname}${updated ? ":new" : ""}`;
    let alreadySent = false;
    try {
      alreadySent = window.sessionStorage.getItem(visitKey) === "1";
    } catch {}

    if (!alreadySent && pennyClickId) {
      try {
        window.sessionStorage.setItem(visitKey, "1");
      } catch {}
      void fetch("/api/tracking/visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ attribution: captured }),
      }).catch(() => {});
    }
  }, []);

  return null;
}

export function readAttributionFromStorage(): AttributionData & { pennyClickId?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AttributionData & { pennyClickId?: string }) : {};
    if (!parsed.pennyClickId) {
      const cookieId = readCookie(PENNYCLICK_COOKIE);
      if (cookieId) parsed.pennyClickId = cookieId;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function clearAttribution() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TRACKING_STORAGE_KEY);
  } catch {
    // ignore
  }
}

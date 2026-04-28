"use client";

import { useEffect } from "react";
import { CLICK_ID_PARAMS, UTM_PARAMS, TRACKING_STORAGE_KEY, TRACKING_TTL_DAYS, type AttributionData } from "@/lib/tracking/click-ids";

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

    const hasAnyCapture = Object.keys(captured).some((k) => k !== "capturedAt");

    if (updated || !captured.landingPage) {
      captured.landingPage = url.pathname + url.search;
      captured.referrer = document.referrer || captured.referrer || "";
      captured.capturedAt = new Date().toISOString();
      try {
        window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(captured));
      } catch {
        // ignore quota errors
      }
    } else if (hasAnyCapture && !captured.capturedAt) {
      captured.capturedAt = new Date().toISOString();
      try {
        window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(captured));
      } catch {
        // ignore
      }
    }
  }, []);

  return null;
}

export function readAttributionFromStorage(): AttributionData {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AttributionData;
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

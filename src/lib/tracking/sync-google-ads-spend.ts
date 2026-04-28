import "server-only";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";

/**
 * Pull daily ad spend from Google Ads via REST API and upsert into AdSpend.
 * Uses the same OAuth refresh token configured for offline conversions.
 */

async function getAccessToken(cfg: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function syncGoogleAdsSpend(daysBack = 30): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const cfg = await getTrackingConfig();
  if (
    !cfg.googleAdsCustomerId ||
    !cfg.googleAdsDeveloperToken ||
    !cfg.googleAdsClientId ||
    !cfg.googleAdsClientSecret ||
    !cfg.googleAdsRefreshToken
  ) {
    return { ok: false, error: "Google Ads config incomplete" };
  }

  let token: string;
  try {
    token = await getAccessToken({
      clientId: cfg.googleAdsClientId,
      clientSecret: cfg.googleAdsClientSecret,
      refreshToken: cfg.googleAdsRefreshToken,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "auth failed" };
  }

  const customerId = cfg.googleAdsCustomerId.replace(/-/g, "");
  const loginCustomerId = cfg.googleAdsLoginCustomerId?.replace(/-/g, "");

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().slice(0, 10);

  const query = `
    SELECT segments.date, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date >= '${sinceStr}'
  `;

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": cfg.googleAdsDeveloperToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    return { ok: false, error: `Google Ads ${res.status}: ${(await res.text()).slice(0, 500)}` };
  }

  type Row = {
    segments: { date: string };
    campaign: { name: string };
    metrics: { costMicros: string; impressions: string; clicks: string; conversions: number };
  };
  const text = await res.text();
  let payload: { results?: Row[] }[];
  try {
    payload = JSON.parse(text) as { results?: Row[] }[];
  } catch {
    return { ok: false, error: "Failed to parse Google Ads response" };
  }
  const allRows = payload.flatMap((batch) => batch.results || []);

  let written = 0;
  for (const r of allRows) {
    const date = new Date(r.segments.date + "T00:00:00Z");
    const spend = Number(r.metrics.costMicros) / 1_000_000;
    if (spend === 0 && Number(r.metrics.clicks) === 0) continue;
    await prisma.adSpend.upsert({
      where: { id: `ga-${r.segments.date}-${r.campaign.name}` },
      create: {
        id: `ga-${r.segments.date}-${r.campaign.name}`,
        date,
        platform: "google_ads",
        campaign: r.campaign.name,
        spend,
        impressions: Number(r.metrics.impressions || 0),
        clicks: Number(r.metrics.clicks || 0),
        conversions: Math.round(Number(r.metrics.conversions || 0)),
      },
      update: {
        spend,
        impressions: Number(r.metrics.impressions || 0),
        clicks: Number(r.metrics.clicks || 0),
        conversions: Math.round(Number(r.metrics.conversions || 0)),
      },
    });
    written++;
  }

  return { ok: true, rows: written };
}

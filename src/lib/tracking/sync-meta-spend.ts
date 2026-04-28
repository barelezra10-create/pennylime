import "server-only";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";

/**
 * Pull daily ad spend from Meta Marketing API and upsert into AdSpend.
 * Requires metaAdAccountId (e.g., "act_1234567890") and metaConversionsApiToken
 * (a long-lived system user / business token with ads_read).
 */

type InsightRow = {
  date_start: string;
  campaign_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
};

export async function syncMetaSpend(daysBack = 30): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const cfg = await getTrackingConfig();
  if (!cfg.metaAdAccountId || !cfg.metaConversionsApiToken) {
    return { ok: false, error: "Meta config incomplete (need ad account ID + access token)" };
  }

  const acct = cfg.metaAdAccountId.startsWith("act_") ? cfg.metaAdAccountId : `act_${cfg.metaAdAccountId}`;
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  const params = new URLSearchParams({
    access_token: cfg.metaConversionsApiToken,
    fields: "spend,impressions,clicks,actions,campaign_name",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    level: "campaign",
    limit: "500",
  });

  const url = `https://graph.facebook.com/v18.0/${acct}/insights?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, error: `Meta ${res.status}: ${(await res.text()).slice(0, 500)}` };
  }
  const data = (await res.json()) as { data?: InsightRow[]; error?: { message?: string } };
  if (data.error) return { ok: false, error: data.error.message || "Meta error" };
  const rows = data.data || [];

  let written = 0;
  for (const r of rows) {
    const conversions = Number(
      r.actions?.find((a) => a.action_type === "lead" || a.action_type === "complete_registration" || a.action_type === "purchase")?.value || 0
    );
    const date = new Date(r.date_start + "T00:00:00Z");
    const id = `meta-${r.date_start}-${r.campaign_name || "all"}`;
    await prisma.adSpend.upsert({
      where: { id },
      create: {
        id,
        date,
        platform: "meta",
        campaign: r.campaign_name || null,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        conversions: Math.round(conversions),
      },
      update: {
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        conversions: Math.round(conversions),
      },
    });
    written++;
  }

  return { ok: true, rows: written };
}

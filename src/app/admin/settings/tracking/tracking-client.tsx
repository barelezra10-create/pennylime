"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { saveTrackingConfig } from "@/actions/tracking";
import { TRACKING_EVENTS, EVENT_DESCRIPTIONS, PLATFORM_LABELS, type TrackingEventName } from "@/lib/tracking/click-ids";

type Config = {
  id: string;
  enabled: boolean;
  testMode: boolean;
  googleAdsConversionId: string | null;
  googleAdsDeveloperToken: string | null;
  googleAdsCustomerId: string | null;
  googleAdsLoginCustomerId: string | null;
  googleAdsRefreshToken: string | null;
  googleAdsClientId: string | null;
  googleAdsClientSecret: string | null;
  ga4MeasurementId: string | null;
  ga4ApiSecret: string | null;
  metaPixelId: string | null;
  metaConversionsApiToken: string | null;
  metaTestEventCode: string | null;
  tiktokPixelId: string | null;
  tiktokAccessToken: string | null;
  tiktokTestEventCode: string | null;
  microsoftUetTagId: string | null;
  microsoftConversionsApiToken: string | null;
  eventMappings: string;
  customHeadHtml: string | null;
  customBodyHtml: string | null;
};

type RecentEvent = {
  id: string;
  eventName: string;
  contactId: string | null;
  clickIds: string;
  value: number | null;
  currency: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

type Tab = "platforms" | "events" | "scripts" | "log";

export function TrackingClient({ config, recentEvents }: { config: Config; recentEvents: RecentEvent[] }) {
  const [tab, setTab] = useState<Tab>("platforms");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const eventMappings = parseEventMappings(config.eventMappings);

  async function onSubmit(formData: FormData) {
    setSaving(true);
    try {
      await saveTrackingConfig(formData);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Tracking & Pixels" />

      <div className="flex items-center gap-2 border-b border-[#e4e4e7]">
        <TabBtn active={tab === "platforms"} onClick={() => setTab("platforms")}>Platforms & IDs</TabBtn>
        <TabBtn active={tab === "events"} onClick={() => setTab("events")}>Event mappings</TabBtn>
        <TabBtn active={tab === "scripts"} onClick={() => setTab("scripts")}>Custom scripts</TabBtn>
        <TabBtn active={tab === "log"} onClick={() => setTab("log")}>Event log</TabBtn>
      </div>

      <form action={onSubmit} className="space-y-8">
        <div className="flex items-center justify-between bg-white border border-[#e4e4e7] rounded-xl p-4">
          <div className="flex items-center gap-6">
            <Toggle name="enabled" label="Tracking enabled" defaultChecked={config.enabled} />
            <Toggle name="testMode" label="Test mode" defaultChecked={config.testMode} />
          </div>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-[12px] text-[#15803d]">Saved</span>}
            <button
              type="submit"
              disabled={saving}
              className="bg-[#15803d] text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-[#166534] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {tab === "platforms" && (
          <div className="space-y-6">
            <Card title="Google Ads" subtitle="gclid + offline conversion API. AW-XXXXXXXXX format for conversion ID.">
              <Grid>
                <Field name="googleAdsConversionId" label="Conversion / gtag ID" placeholder="AW-1234567890" defaultValue={config.googleAdsConversionId} />
                <Field name="googleAdsCustomerId" label="Customer ID" placeholder="123-456-7890" defaultValue={config.googleAdsCustomerId} />
                <Field name="googleAdsLoginCustomerId" label="Login customer ID (MCC)" placeholder="123-456-7890" defaultValue={config.googleAdsLoginCustomerId} />
                <Field name="googleAdsDeveloperToken" label="Developer token" defaultValue={config.googleAdsDeveloperToken} secret />
                <Field name="googleAdsClientId" label="OAuth client ID" defaultValue={config.googleAdsClientId} />
                <Field name="googleAdsClientSecret" label="OAuth client secret" defaultValue={config.googleAdsClientSecret} secret />
                <Field name="googleAdsRefreshToken" label="OAuth refresh token" defaultValue={config.googleAdsRefreshToken} secret full />
              </Grid>
            </Card>

            <Card title="GA4" subtitle="Google Analytics 4 + Measurement Protocol for server events.">
              <Grid>
                <Field name="ga4MeasurementId" label="Measurement ID" placeholder="G-XXXXXXXXXX" defaultValue={config.ga4MeasurementId} />
                <Field name="ga4ApiSecret" label="API secret" defaultValue={config.ga4ApiSecret} secret />
              </Grid>
            </Card>

            <Card title="Meta (Facebook + Instagram)" subtitle="fbclid + Conversions API.">
              <Grid>
                <Field name="metaPixelId" label="Pixel ID" placeholder="1234567890123456" defaultValue={config.metaPixelId} />
                <Field name="metaConversionsApiToken" label="Conversions API access token" defaultValue={config.metaConversionsApiToken} secret />
                <Field name="metaTestEventCode" label="Test event code (optional)" placeholder="TEST12345" defaultValue={config.metaTestEventCode} />
              </Grid>
            </Card>

            <Card title="TikTok" subtitle="ttclid + Events API.">
              <Grid>
                <Field name="tiktokPixelId" label="Pixel ID" placeholder="C4XXXXXXXXXXX" defaultValue={config.tiktokPixelId} />
                <Field name="tiktokAccessToken" label="Events API access token" defaultValue={config.tiktokAccessToken} secret />
                <Field name="tiktokTestEventCode" label="Test event code (optional)" defaultValue={config.tiktokTestEventCode} />
              </Grid>
            </Card>

            <Card title="Microsoft Ads (Bing)" subtitle="msclkid + UET tag + Offline Conversions API.">
              <Grid>
                <Field name="microsoftUetTagId" label="UET tag ID" placeholder="12345678" defaultValue={config.microsoftUetTagId} />
                <Field name="microsoftConversionsApiToken" label="Offline conversions API token" defaultValue={config.microsoftConversionsApiToken} secret />
              </Grid>
            </Card>
          </div>
        )}

        {tab === "events" && (
          <Card
            title="Event mapping"
            subtitle="Each event fires automatically to whichever platforms are configured. Add a per-platform conversion label/action where required."
          >
            <div className="space-y-5">
              {TRACKING_EVENTS.map((evt) => (
                <EventRow key={evt} event={evt} mapping={eventMappings[evt] || {}} />
              ))}
            </div>
            <input type="hidden" name="eventMappings" value={config.eventMappings} />
            <p className="mt-4 text-[12px] text-[#a1a1aa]">
              Per-event mapping editor coming in next iteration. For now, set Google Ads conversion labels server-side via env (CONVERSION_LABEL_LEAD_SUBMIT etc).
            </p>
          </Card>
        )}

        {tab === "scripts" && (
          <div className="space-y-6">
            <Card title="Custom <head> HTML" subtitle="Injected after standard pixels. Useful for chat widgets, custom analytics, schema markup.">
              <textarea
                name="customHeadHtml"
                defaultValue={config.customHeadHtml || ""}
                rows={8}
                className="w-full font-mono text-[12px] border border-[#e4e4e7] rounded-lg p-3 outline-none focus:border-[#15803d]"
                placeholder='<script>...</script>'
              />
            </Card>
            <Card title="Custom <body> HTML (end of body)" subtitle="For things that should load late.">
              <textarea
                name="customBodyHtml"
                defaultValue={config.customBodyHtml || ""}
                rows={8}
                className="w-full font-mono text-[12px] border border-[#e4e4e7] rounded-lg p-3 outline-none focus:border-[#15803d]"
              />
            </Card>
          </div>
        )}

        {tab === "log" && (
          <Card title="Recent tracking events" subtitle="Last 25 events received from the client or fired server-side.">
            {recentEvents.length === 0 ? (
              <p className="text-[13px] text-[#a1a1aa]">No events yet. Submit a lead from a landing page or trigger an admin action to populate this log.</p>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-[#a1a1aa] border-b border-[#e4e4e7]">
                      <th className="px-5 py-2">Time</th>
                      <th className="px-5 py-2">Event</th>
                      <th className="px-5 py-2">Status</th>
                      <th className="px-5 py-2">Value</th>
                      <th className="px-5 py-2">Click IDs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((e) => (
                      <tr key={e.id} className="border-b border-[#f4f4f5]">
                        <td className="px-5 py-3 text-[#71717a] tabular-nums">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="px-5 py-3 font-mono">{e.eventName}</td>
                        <td className="px-5 py-3">
                          <StatusPill status={e.status} />
                        </td>
                        <td className="px-5 py-3 tabular-nums">{e.value != null ? `${e.currency || "USD"} ${e.value.toFixed(2)}` : "—"}</td>
                        <td className="px-5 py-3 text-[#71717a] truncate max-w-[260px]">
                          <code className="text-[11px]">{summarizeClickIds(e.clickIds)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </form>
    </div>
  );
}

function parseEventMappings(raw: string): Record<string, Record<string, string>> {
  try {
    return JSON.parse(raw) as Record<string, Record<string, string>>;
  } catch {
    return {};
  }
}

function summarizeClickIds(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).filter((k) => parsed[k] && k !== "capturedAt" && k !== "landingPage" && k !== "referrer");
    if (keys.length === 0) return "(none)";
    return keys.map((k) => `${k}`).join(", ");
  } catch {
    return "(invalid)";
  }
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
        active ? "border-[#15803d] text-black" : "border-transparent text-[#71717a] hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e4e4e7] rounded-xl p-5">
      <h3 className="text-[14px] font-bold text-black">{title}</h3>
      {subtitle && <p className="text-[12px] text-[#71717a] mt-0.5 mb-4">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  name,
  label,
  placeholder,
  defaultValue,
  secret,
  full,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string | null;
  secret?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#71717a] block mb-1">{label}</label>
      <input
        type={secret ? "password" : "text"}
        name={name}
        defaultValue={defaultValue || ""}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-2 outline-none focus:border-[#15803d]"
      />
    </div>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[13px] font-medium text-black cursor-pointer select-none">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="w-4 h-4 accent-[#15803d]" />
      {label}
    </label>
  );
}

function EventRow({ event, mapping }: { event: TrackingEventName; mapping: Record<string, string> }) {
  return (
    <div className="border border-[#e4e4e7] rounded-lg p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <code className="text-[12px] font-mono font-bold text-black">{event}</code>
        <span className="text-[11px] text-[#71717a]">{EVENT_DESCRIPTIONS[event]}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {(Object.keys(PLATFORM_LABELS) as Array<keyof typeof PLATFORM_LABELS>).map((platform) => (
          <span
            key={platform}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
              mapping[platform] ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fafafa] text-[#a1a1aa]"
            }`}
          >
            {PLATFORM_LABELS[platform]}
            {mapping[platform] && <span className="font-mono">({mapping[platform]})</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    received: "bg-[#eff6ff] text-[#2563eb]",
    sent: "bg-[#f0fdf4] text-[#15803d]",
    failed: "bg-[#fef2f2] text-[#dc2626]",
    pending: "bg-[#fffbeb] text-[#b45309]",
    skipped: "bg-[#fafafa] text-[#71717a]",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-[0.04em] rounded px-1.5 py-0.5 ${colorMap[status] || "bg-[#fafafa] text-[#71717a]"}`}>
      {status}
    </span>
  );
}

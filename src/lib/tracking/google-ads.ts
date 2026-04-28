/**
 * Google Ads Offline Click Conversions (OCI) via the Google Ads REST API.
 * Docs: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 *
 * Requires:
 *  - googleAdsConversionActionId  : the numeric ID (NOT the gtag label) - per-event
 *  - googleAdsCustomerId          : numeric, no dashes
 *  - googleAdsLoginCustomerId     : numeric, no dashes (MCC)
 *  - googleAdsRefreshToken        : OAuth2 refresh token
 *  - googleAdsClientId, googleAdsClientSecret : OAuth2 app credentials
 *  - googleAdsDeveloperToken      : Google Ads API developer token
 */

type GoogleAdsConfig = {
  customerId: string;
  loginCustomerId?: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type ConversionInput = {
  conversionActionId: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  conversionDateTime: Date;
  value: number;
  currency: string;
  orderId?: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: GoogleAdsConfig): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Ads OAuth failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function fmtDate(d: Date): string {
  // Google Ads expects "yyyy-MM-dd HH:mm:ss+00:00"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

export async function uploadClickConversion(cfg: GoogleAdsConfig, input: ConversionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.gclid && !input.gbraid && !input.wbraid) {
    return { ok: false, error: "no click identifier (gclid/gbraid/wbraid)" };
  }

  let token: string;
  try {
    token = await getAccessToken(cfg);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "auth failed" };
  }

  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${cfg.customerId}/conversionActions/${input.conversionActionId}`,
    conversionDateTime: fmtDate(input.conversionDateTime),
    conversionValue: input.value,
    currencyCode: input.currency,
  };
  if (input.gclid) conversion.gclid = input.gclid;
  if (input.gbraid) conversion.gbraid = input.gbraid;
  if (input.wbraid) conversion.wbraid = input.wbraid;
  if (input.orderId) conversion.orderId = input.orderId;

  const url = `https://googleads.googleapis.com/v17/customers/${cfg.customerId}:uploadClickConversions`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": cfg.developerToken,
    "content-type": "application/json",
  };
  if (cfg.loginCustomerId) headers["login-customer-id"] = cfg.loginCustomerId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversions: [conversion],
      partialFailure: true,
      validateOnly: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Google Ads ${res.status}: ${body.slice(0, 500)}` };
  }
  const data = (await res.json()) as { partialFailureError?: { message?: string } };
  if (data.partialFailureError?.message) {
    return { ok: false, error: `Partial failure: ${data.partialFailureError.message}` };
  }
  return { ok: true };
}

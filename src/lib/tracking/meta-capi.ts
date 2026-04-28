import { sha256Hex, normalizePhone } from "@/lib/tracking/hash";

/**
 * Meta Conversions API (CAPI).
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

type MetaConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
};

type MetaUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string; // pennyClickId
  fbclid?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function sendMetaEvent(
  cfg: MetaConfig,
  eventName: string,
  user: MetaUserData,
  custom: { value: number; currency: string; orderId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userData: Record<string, unknown> = {};
  const em = sha256Hex(user.email);
  if (em) userData.em = [em];
  const ph = sha256Hex(normalizePhone(user.phone));
  if (ph) userData.ph = [ph];
  const fn = sha256Hex(user.firstName);
  if (fn) userData.fn = [fn];
  const ln = sha256Hex(user.lastName);
  if (ln) userData.ln = [ln];
  if (user.externalId) userData.external_id = [user.externalId];
  if (user.fbclid) userData.fbc = `fb.1.${Date.now()}.${user.fbclid}`;
  if (user.ipAddress) userData.client_ip_address = user.ipAddress;
  if (user.userAgent) userData.client_user_agent = user.userAgent;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: userData,
    custom_data: {
      value: custom.value,
      currency: custom.currency,
      ...(custom.orderId ? { order_id: custom.orderId } : {}),
    },
  };

  const body: Record<string, unknown> = { data: [event] };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  const url = `https://graph.facebook.com/v18.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Meta ${res.status}: ${text.slice(0, 500)}` };
  }
  const data = (await res.json()) as { events_received?: number };
  if (!data.events_received) return { ok: false, error: `Meta returned 0 events_received` };
  return { ok: true };
}

import { sha256Hex, normalizePhone } from "@/lib/tracking/hash";

/**
 * TikTok Events API.
 * Docs: https://business-api.tiktok.com/portal/docs?id=1771101027431425
 */

type TikTokConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
};

type TikTokUserData = {
  email?: string;
  phone?: string;
  externalId?: string; // pennyClickId
  ttclid?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function sendTikTokEvent(
  cfg: TikTokConfig,
  eventName: string,
  user: TikTokUserData,
  custom: { value: number; currency: string; orderId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userData: Record<string, unknown> = {};
  const em = sha256Hex(user.email);
  if (em) userData.email = em;
  const ph = sha256Hex(normalizePhone(user.phone));
  if (ph) userData.phone = ph;
  if (user.externalId) userData.external_id = sha256Hex(user.externalId);
  if (user.ttclid) userData.ttclid = user.ttclid;
  if (user.ipAddress) userData.ip = user.ipAddress;
  if (user.userAgent) userData.user_agent = user.userAgent;

  const event = {
    event: eventName,
    event_time: Math.floor(Date.now() / 1000),
    user: userData,
    properties: {
      value: custom.value,
      currency: custom.currency,
      ...(custom.orderId ? { order_id: custom.orderId } : {}),
    },
  };

  const body: Record<string, unknown> = {
    pixel_code: cfg.pixelId,
    data: [event],
  };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Access-Token": cfg.accessToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `TikTok ${res.status}: ${text.slice(0, 500)}` };
  }
  const data = (await res.json()) as { code?: number; message?: string };
  if (data.code !== undefined && data.code !== 0) {
    return { ok: false, error: `TikTok code=${data.code} ${data.message || ""}` };
  }
  return { ok: true };
}

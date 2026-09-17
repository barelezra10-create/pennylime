import "server-only";
import { getTrackingConfig } from "@/lib/tracking/config";

export type OwnedNumber = { number: string; label: string };

// Twilio-owned numbers change rarely; cache for 5 min so the dialer dropdown
// and the outbound caller-ID validation don't hit Twilio on every call.
let cache: { at: number; nums: OwnedNumber[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * List the voice-capable phone numbers this Twilio account owns. Used to
 * populate the dialer's outbound-number picker and to validate a chosen
 * caller ID (you can only set caller ID to a number you own).
 */
export async function listOwnedVoiceNumbers(): Promise<OwnedNumber[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.nums;

  const cfg = await getTrackingConfig();
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) return [];

  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");
  const nums: OwnedNumber[] = [];
  let next: string | null = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`;
  const seen = new Set<string>();
  try {
    while (next) {
      if (seen.has(next)) return cache?.nums ?? [];
      seen.add(next);
      const res = await fetch(next, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return cache?.nums ?? [];
      const json = await res.json() as {
        incoming_phone_numbers?: Array<{ phone_number: string; friendly_name?: string; capabilities?: { voice?: boolean } }>;
        next_page_uri?: string | null;
      };
      nums.push(...(json.incoming_phone_numbers ?? []).filter(n => n.capabilities?.voice === true)
        .map(n => ({ number: n.phone_number, label: n.friendly_name || n.phone_number })));
      if (json.next_page_uri) {
        const url = new URL(json.next_page_uri, "https://api.twilio.com");
        // Never forward credentials outside the account’s Twilio endpoint.
        if (url.origin !== "https://api.twilio.com" || !url.pathname.startsWith(`/2010-04-01/Accounts/${cfg.twilioAccountSid}/IncomingPhoneNumbers`)) return cache?.nums ?? [];
        next = url.href;
      } else next = null;
    }
  } catch { return cache?.nums ?? []; }

  cache = { at: Date.now(), nums };
  return nums;
}

/** True when `number` is a voice number this account owns (caller-ID guard). */
export async function isOwnedNumber(number: string): Promise<boolean> {
  const nums = await listOwnedVoiceNumbers();
  return nums.some((n) => n.number === number);
}

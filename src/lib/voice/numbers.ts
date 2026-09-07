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
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok) return cache?.nums ?? [];

  const json = (await res.json().catch(() => null)) as
    | { incoming_phone_numbers?: Array<{ phone_number: string; friendly_name?: string; capabilities?: { voice?: boolean } }> }
    | null;

  const nums: OwnedNumber[] = (json?.incoming_phone_numbers ?? [])
    .filter((n) => n.capabilities?.voice !== false)
    .map((n) => ({ number: n.phone_number, label: n.friendly_name || n.phone_number }));

  cache = { at: Date.now(), nums };
  return nums;
}

/** True when `number` is a voice number this account owns (caller-ID guard). */
export async function isOwnedNumber(number: string): Promise<boolean> {
  const nums = await listOwnedVoiceNumbers();
  return nums.some((n) => n.number === number);
}

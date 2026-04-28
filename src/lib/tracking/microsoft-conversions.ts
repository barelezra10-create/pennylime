/**
 * Microsoft Ads Offline Conversions API (Bing).
 * Docs: https://learn.microsoft.com/en-us/advertising/guides/universal-event-tracking
 *
 * Note: Microsoft's offline conversions are typically uploaded via the Bing Ads Bulk
 * file API. For a lighter-weight integration the Conversions API endpoint exists for
 * partner accounts. We log the intent here but no-op unless a token is provided.
 */

type MicrosoftConfig = {
  uetTagId: string;
  apiToken?: string | null;
};

export async function sendMicrosoftConversion(
  cfg: MicrosoftConfig,
  goalName: string,
  msclkid: string | undefined,
  custom: { value: number; currency: string; orderId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cfg.apiToken) {
    return { ok: false, error: "no microsoft conversions API token configured (UET tag still fires client-side)" };
  }
  if (!msclkid) {
    return { ok: false, error: "no msclkid available" };
  }
  // Stub: full Bing Bulk API integration requires OAuth + customer/account IDs not in MVP scope.
  // Returning a structured "skipped" so the event log records the attempt.
  return {
    ok: false,
    error: `Microsoft offline upload requires Bing Bulk API (OAuth + customer/account ID). goal=${goalName} msclkid=${msclkid.slice(0, 8)}… value=${custom.value}`,
  };
}

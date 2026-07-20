import "server-only";

// Keep "increase" in the union so existing call-site comparisons (=== "increase",
// === "goach") continue to typecheck. getPaymentProcessor always returns "goach".
export type ProcessorName = "increase" | "goach";

/** GoACH is the only processor now. Constant kept so existing callers need no change. */
export async function getPaymentProcessor(): Promise<ProcessorName> {
  return "goach";
}

export function goachEnv(): { apiKey: string; baseUrl: string; originatorUuid: string } | null {
  const apiKey = process.env.GOACH_API_KEY;
  const originatorUuid = process.env.GOACH_ORIGINATOR_UUID;
  if (!apiKey || !originatorUuid) return null;
  const baseUrl = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, originatorUuid };
}

/**
 * True only when GoACH is fully configured AND pointed at the production host.
 * Every money-origination path checks this so we can never charge a real
 * borrower against the simulated staging endpoint.
 */
export function goachProductionReady(): boolean {
  const env = goachEnv();
  return !!env && env.baseUrl.includes("login.goach.com");
}

import "server-only";
import { getTrackingConfig } from "@/lib/tracking/config";

export type ProcessorName = "increase" | "goach";

/** Which processor NEW transactions should use. Defaults to increase. */
export async function getPaymentProcessor(): Promise<ProcessorName> {
  const cfg = await getTrackingConfig();
  return cfg.paymentProcessor === "goach" ? "goach" : "increase";
}

export function goachEnv(): { apiKey: string; baseUrl: string; originatorUuid: string } | null {
  const apiKey = process.env.GOACH_API_KEY;
  const originatorUuid = process.env.GOACH_ORIGINATOR_UUID;
  if (!apiKey || !originatorUuid) return null;
  const baseUrl = (process.env.GOACH_BASE_URL || "https://staging.goach.com/api/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, originatorUuid };
}

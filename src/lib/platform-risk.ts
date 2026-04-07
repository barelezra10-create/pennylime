/**
 * Gig platform risk factors (0-1 scale).
 * Lower = less risky. Based on income stability and platform maturity.
 * These values serve as the cold-start baseline; the ML model learns
 * actual risk from loan outcomes over time.
 */
const PLATFORM_RISK: Record<string, number> = {
  uber: 0.25,
  lyft: 0.30,
  doordash: 0.35,
  grubhub: 0.40,
  instacart: 0.35,
  postmates: 0.45,
  amazon_flex: 0.30,
  shipt: 0.40,
  taskrabbit: 0.55,
  fiverr: 0.60,
  upwork: 0.50,
  rover: 0.55,
  handy: 0.60,
  thumbtack: 0.55,
};

const DEFAULT_RISK = 0.5;

/**
 * Get the risk factor for a gig platform.
 * Returns 0-1 where higher = riskier.
 * Returns 0.5 (neutral) for unknown platforms.
 */
export function getPlatformRisk(platform: string | null | undefined): number {
  if (!platform) return DEFAULT_RISK;
  return PLATFORM_RISK[platform.toLowerCase()] ?? DEFAULT_RISK;
}

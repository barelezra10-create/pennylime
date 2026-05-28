/**
 * State-by-state Commercial Financing Disclosure Law (CFDL) coverage.
 *
 * Each CFDL state requires a written disclosure delivered to the
 * merchant BEFORE the receivables purchase agreement is signed. The
 * disclosures must include APR-equivalent, total cost, total payments,
 * prepayment terms, and other state-specific fields.
 *
 * We use a single base disclosure form with state-specific footers,
 * because the underlying disclosure box fields are nearly identical
 * across states. The state code controls which footer + jurisdiction
 * statement renders.
 */

export type CfdlState = "NY" | "CA" | "UT" | "VA" | "GA" | "CT" | "MO" | "KS";

export const CFDL_STATES: CfdlState[] = ["NY", "CA", "UT", "VA", "GA", "CT", "MO", "KS"];

const STATE_NAMES: Record<CfdlState, string> = {
  NY: "New York",
  CA: "California",
  UT: "Utah",
  VA: "Virginia",
  GA: "Georgia",
  CT: "Connecticut",
  MO: "Missouri",
  KS: "Kansas",
};

const STATE_STATUTES: Record<CfdlState, string> = {
  NY: "New York Financial Services Law §§ 800-815 and 23 NYCRR Part 600 (the Commercial Finance Disclosure Law)",
  CA: "California Financial Code §§ 22800 et seq. and 10 CCR §§ 900-960 (the Commercial Financing Disclosure Law)",
  UT: "Utah Code §§ 7-27-101 et seq. (the Commercial Financing Registration and Disclosure Act)",
  VA: "Virginia Code §§ 6.2-2228 et seq. (the Commercial Financing Disclosure Act)",
  GA: "Georgia Code §§ 7-7-1 et seq. (the Commercial Financing Disclosure Law)",
  CT: "Connecticut General Statutes §§ 36a-860 et seq. (the Commercial Financing Disclosure Act)",
  MO: "Missouri Revised Statutes §§ 408.700 et seq. (the Commercial Financing Disclosure Act)",
  KS: "Kansas Statutes Annotated §§ 16a-2-901 et seq. (the Kansas Commercial Financing Disclosure Act)",
};

/**
 * Threshold above which the CFDL disclosure is NOT required.
 * NY caps at $2.5M, CT at $250K, most others at $500K or unlimited;
 * PennyLime's max advance is $10K, so we always need to disclose in
 * CFDL states.
 */
const STATE_CAPS: Record<CfdlState, number> = {
  NY: 2_500_000,
  CA: 500_000,
  UT: Number.POSITIVE_INFINITY, // all commercial financing
  VA: 500_000,
  GA: 500_000,
  CT: 250_000,
  MO: Number.POSITIVE_INFINITY,
  KS: Number.POSITIVE_INFINITY,
};

export function isCfdlState(stateCode: string | null | undefined): stateCode is CfdlState {
  if (!stateCode) return false;
  return (CFDL_STATES as string[]).includes(stateCode.toUpperCase());
}

export function requiresCfdlDisclosure(
  stateCode: string | null | undefined,
  disbursedAmount: number,
): stateCode is CfdlState {
  if (!isCfdlState(stateCode)) return false;
  return disbursedAmount <= STATE_CAPS[stateCode];
}

export function getStateName(state: CfdlState): string {
  return STATE_NAMES[state];
}

export function getStateStatute(state: CfdlState): string {
  return STATE_STATUTES[state];
}

/**
 * Normalize a state input (e.g. "ny", "New York", "NY ") to the
 * 2-letter code we use internally.
 */
export function normalizeStateCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length === 2) return trimmed;
  // Full state name lookup
  const lookup: Record<string, string> = {
    "NEW YORK": "NY",
    CALIFORNIA: "CA",
    UTAH: "UT",
    VIRGINIA: "VA",
    GEORGIA: "GA",
    CONNECTICUT: "CT",
    MISSOURI: "MO",
    KANSAS: "KS",
  };
  return lookup[trimmed] || null;
}

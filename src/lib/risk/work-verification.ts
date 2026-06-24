// Deterministic work-verification comparator. Given the deposits we
// pulled from the applicant's bank statement (and/or Plaid) plus what
// they declared on the funnel, decide whether the bank data actually
// shows the gig/business income they claim. Pure + testable; the DB
// wiring lives in src/actions/application-documents.ts.

export type WorkVerificationStatus = "VERIFIED" | "WEAK" | "UNVERIFIED";

export type DepositLike = { description: string; amount: number };

export type WorkVerificationResult = {
  status: WorkVerificationStatus;
  reason: string;
  matchedCount: number;
  matchedTotal: number;
  matchedSources: string[];
};

// Gig-platform payout signatures seen in bank descriptions. Covers the
// common variants ("DD DOORDASH", "UBER * EATS", "AMZN Flex", etc.).
const GIG_KEYWORDS = [
  "uber", "lyft", "doordash", "door dash", "instacart", "grubhub", "amazon flex",
  "amzn", "postmates", "taskrabbit", "fiverr", "upwork", "shipt", "gopuff",
  "walmart spark", "spark driver",
];

// Card-processor / marketplace settlement signatures for businesses.
const PROCESSOR_KEYWORDS = [
  "stripe", "square", "sq *", "toast", "clover", "shopify", "paypal", "venmo",
  "sumup", "helcim", "authorize.net", "authnet", "intuit", "quickbooks",
  "merchant", "deposit-merch", "settlement",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchKeyword(desc: string, keywords: string[]): string | null {
  const n = norm(desc);
  for (const k of keywords) {
    if (n.includes(k)) return k;
  }
  return null;
}

/**
 * Evaluate whether deposits corroborate the declared work.
 *
 * - INDEPENDENT_CONTRACTOR: look for gig-platform payouts.
 * - BUSINESS_OWNER: look for card-processor settlements.
 *
 * 3+ matching deposits => VERIFIED, 1-2 => WEAK, 0 => UNVERIFIED. An
 * empty deposit list (unreadable statement) is UNVERIFIED with a reason
 * that tells the reviewer why.
 */
export function evaluateWorkSignals(input: {
  workerType: string;
  deposits: DepositLike[];
}): WorkVerificationResult {
  const isBusiness = input.workerType === "BUSINESS_OWNER";
  const keywords = isBusiness ? PROCESSOR_KEYWORDS : GIG_KEYWORDS;
  const label = isBusiness ? "card-processor settlements" : "gig-platform deposits";

  const incomeDeposits = input.deposits.filter((d) => d.amount > 0);
  if (incomeDeposits.length === 0) {
    return {
      status: "UNVERIFIED",
      reason: "No deposits could be read from the statement. Manual review needed.",
      matchedCount: 0,
      matchedTotal: 0,
      matchedSources: [],
    };
  }

  const matchedSources = new Set<string>();
  let matchedCount = 0;
  let matchedTotal = 0;
  for (const d of incomeDeposits) {
    const hit = matchKeyword(d.description, keywords);
    if (hit) {
      matchedCount++;
      matchedTotal += d.amount;
      matchedSources.add(hit);
    }
  }

  const sources = [...matchedSources];
  const dollars = `$${Math.round(matchedTotal).toLocaleString()}`;

  if (matchedCount >= 3) {
    return {
      status: "VERIFIED",
      reason: `Found ${matchedCount} ${label} totaling ${dollars} (${sources.join(", ")}).`,
      matchedCount,
      matchedTotal,
      matchedSources: sources,
    };
  }
  if (matchedCount >= 1) {
    return {
      status: "WEAK",
      reason: `Only ${matchedCount} ${label} found (${sources.join(", ")}) totaling ${dollars}. Thin history, review recommended.`,
      matchedCount,
      matchedTotal,
      matchedSources: sources,
    };
  }
  return {
    status: "UNVERIFIED",
    reason: `No ${label} found among ${incomeDeposits.length} deposits. Declared work could not be confirmed from the bank data.`,
    matchedCount: 0,
    matchedTotal: 0,
    matchedSources: [],
  };
}

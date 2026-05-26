import "server-only";

/**
 * Increase ACH client.
 * Docs: https://increase.com/documentation/api
 *
 * Same base URL for sandbox and production - the API key prefix decides which mode.
 */

const BASE_URL = "https://api.increase.com";

type IncreaseError = { type?: string; title?: string; detail?: string; status?: number };

function authHeaders(): Record<string, string> {
  const key = process.env.INCREASE_API_KEY;
  if (!key) throw new Error("INCREASE_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
    "Increase-Version": "2024-04-15",
  };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
  if (!res.ok) {
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail) as IncreaseError;
      detail = parsed.detail || parsed.title || detail;
    } catch {}
    return { ok: false, error: `Increase ${res.status}: ${detail.slice(0, 300)}` };
  }
  return { ok: true, data: (await res.json()) as T };
}

/* ─── Account Numbers ─────────────────────────────────────────── */

export type AccountNumber = {
  id: string;
  account_id: string;
  account_number: string;
  routing_number: string;
  status: string;
};

export async function listAccountNumbers() {
  return call<{ data: AccountNumber[] }>("GET", `/account_numbers?account_id=${process.env.INCREASE_ACCOUNT_ID}`);
}

/* ─── External Accounts (merchant bank accounts we'll send to / debit from) ─── */

export type ExternalAccount = {
  id: string;
  description: string;
  account_holder: string;
  status: string;
};

export async function createExternalAccount(input: {
  routingNumber: string;
  accountNumber: string;
  description: string;
  accountHolder?: "business" | "individual";
  funding?: "checking" | "savings";
}): Promise<{ ok: true; data: ExternalAccount } | { ok: false; error: string }> {
  return call<ExternalAccount>("POST", "/external_accounts", {
    routing_number: input.routingNumber,
    account_number: input.accountNumber,
    description: input.description,
    account_holder: input.accountHolder || "individual",
    funding: input.funding || "checking",
  });
}

/* ─── ACH Transfers ───────────────────────────────────────────── */

export type AchTransfer = {
  id: string;
  account_id: string;
  amount: number;
  status: string;
  external_account_id?: string;
  account_number?: string;
  routing_number?: string;
  statement_descriptor: string;
  created_at: string;
};

export async function createAchCredit(input: {
  externalAccountId: string;
  amountCents: number;
  statementDescriptor: string;
  companyName?: string;
  individualName?: string;
  /** Use Same-Day ACH instead of standard 1-3 business day settlement.
   *  Increase honours this when the call lands before the same-day cutoff
   *  (~2pm ET). Past the cutoff, falls back to standard automatically. */
  sameDay?: boolean;
}): Promise<{ ok: true; data: AchTransfer } | { ok: false; error: string }> {
  return call<AchTransfer>("POST", "/ach_transfers", {
    account_id: process.env.INCREASE_ACCOUNT_ID,
    external_account_id: input.externalAccountId,
    amount: input.amountCents,
    statement_descriptor: input.statementDescriptor.slice(0, 16),
    company_name: input.companyName,
    individual_name: input.individualName,
    funding: "checking",
    standard_entry_class_code: "corporate_credit_or_debit",
    same_day_ach: input.sameDay ?? false,
  });
}

export async function createAchDebit(input: {
  externalAccountId: string;
  amountCents: number;
  statementDescriptor: string;
  companyName?: string;
  individualName?: string;
  /** Use Same-Day ACH for the debit. Money clears into our Increase
   *  account by EOD instead of T+1/T+2. We default this ON for portal-
   *  triggered payoff + skip fee debits (customer expects same-day
   *  movement) and let the daily cron decide based on cutoff time. */
  sameDay?: boolean;
}): Promise<{ ok: true; data: AchTransfer } | { ok: false; error: string }> {
  return call<AchTransfer>("POST", "/ach_transfers", {
    account_id: process.env.INCREASE_ACCOUNT_ID,
    external_account_id: input.externalAccountId,
    amount: -Math.abs(input.amountCents),
    statement_descriptor: input.statementDescriptor.slice(0, 16),
    company_name: input.companyName,
    individual_name: input.individualName,
    funding: "checking",
    standard_entry_class_code: "prearranged_payments_and_deposit",
    require_approval: false,
    same_day_ach: input.sameDay ?? false,
  });
}

/* ─── Real-Time Payments ──────────────────────────────────────────
 * Instant 24/7 push payments (not pulls — RTP is push-only). We use
 * this for disbursement credits so the borrower gets cash in their
 * account in seconds rather than 1-3 business days. Settles via RTP
 * rails (TCH or FedNow) - both supported by Increase's single endpoint.
 * Receiving bank must support RTP - if not, Increase returns
 * "destination_routing_number_does_not_support_rtp" and we fall back
 * to ACH at the caller level (see safeDisburse below).
 * ────────────────────────────────────────────────────────────────── */

export type RtpTransfer = {
  id: string;
  account_id: string;
  amount: number;
  status: string;
  external_account_id?: string;
  remittance_information: string;
  created_at: string;
};

export async function createRtpTransfer(input: {
  externalAccountId: string;
  amountCents: number;
  remittanceInformation: string;
  creditorName?: string;
}): Promise<{ ok: true; data: RtpTransfer } | { ok: false; error: string }> {
  return call<RtpTransfer>("POST", "/real_time_payments_transfers", {
    source_account_id: process.env.INCREASE_ACCOUNT_ID,
    external_account_id: input.externalAccountId,
    amount: input.amountCents,
    remittance_information: input.remittanceInformation.slice(0, 140),
    creditor_name: (input.creditorName || "PennyLime").slice(0, 140),
  });
}

/**
 * Disburse with the fastest method the destination bank supports.
 *
 *   1. Try RTP first — instant, 24/7
 *   2. If the receiving bank doesn't support RTP, fall back to Same-Day ACH
 *   3. If we're past the Same-Day cutoff (~2pm ET), fall back to standard ACH
 *
 * Returns a normalised shape so callers don't have to branch on the rail.
 * The `rail` field tells you which channel actually carried the money,
 * useful for analytics + the "expected arrival" copy on the customer
 * portal.
 */
export type DisbursementResult =
  | { ok: true; rail: "rtp" | "same_day_ach" | "ach"; transferId: string; status: string }
  | { ok: false; error: string };

export async function safeDisburse(input: {
  externalAccountId: string;
  amountCents: number;
  statementDescriptor: string;
  individualName?: string;
  remittanceInformation?: string;
}): Promise<DisbursementResult> {
  // 1. RTP first
  const rtp = await createRtpTransfer({
    externalAccountId: input.externalAccountId,
    amountCents: input.amountCents,
    remittanceInformation: input.remittanceInformation || input.statementDescriptor,
    creditorName: "PennyLime",
  });
  if (rtp.ok) {
    return { ok: true, rail: "rtp", transferId: rtp.data.id, status: rtp.data.status };
  }
  // RTP failed - check if the failure was "destination doesn't support RTP"
  // vs a real error. The error string from Increase contains the routing
  // number text. Either way we fall through to ACH.
  console.warn("[increase] RTP failed, falling back to ACH:", rtp.error);

  // 2. Same-Day ACH if we're before the cutoff. Increase ignores the
  //    same_day_ach flag silently if we're past the cutoff, so this is
  //    safe to always pass true and let Increase decide.
  const sameDay = await createAchCredit({
    externalAccountId: input.externalAccountId,
    amountCents: input.amountCents,
    statementDescriptor: input.statementDescriptor,
    individualName: input.individualName,
    sameDay: true,
  });
  if (sameDay.ok) {
    return { ok: true, rail: "same_day_ach", transferId: sameDay.data.id, status: sameDay.data.status };
  }

  // 3. Standard ACH last resort
  const ach = await createAchCredit({
    externalAccountId: input.externalAccountId,
    amountCents: input.amountCents,
    statementDescriptor: input.statementDescriptor,
    individualName: input.individualName,
    sameDay: false,
  });
  if (ach.ok) {
    return { ok: true, rail: "ach", transferId: ach.data.id, status: ach.data.status };
  }
  return { ok: false, error: ach.error };
}

export async function getRtpTransfer(id: string) {
  return call<RtpTransfer>("GET", `/real_time_payments_transfers/${id}`);
}

export async function getAchTransfer(id: string) {
  return call<AchTransfer>("GET", `/ach_transfers/${id}`);
}

/* ─── Accounts (balance) ──────────────────────────────────────── */

export type IncreaseAccount = {
  id: string;
  name: string;
  status: string;
  currency: string;
  // Some Increase environments (sandbox or pre-funded accounts) return
  // balances as null until the first credit posts. Treat as optional.
  balances: {
    current_balance: number;
    available_balance: number;
  } | null;
};

export async function getAccount() {
  const id = process.env.INCREASE_ACCOUNT_ID;
  if (!id) return { ok: false as const, error: "INCREASE_ACCOUNT_ID not configured" };
  return call<IncreaseAccount>("GET", `/accounts/${id}`);
}

export async function listAchTransfers(limit = 20) {
  const id = process.env.INCREASE_ACCOUNT_ID;
  if (!id) return { ok: false as const, error: "INCREASE_ACCOUNT_ID not configured" };
  return call<{ data: AchTransfer[] }>(
    "GET",
    `/ach_transfers?account_id=${id}&limit=${limit}`,
  );
}

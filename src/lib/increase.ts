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
    route_number: input.routingNumber,
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
  });
}

export async function createAchDebit(input: {
  externalAccountId: string;
  amountCents: number;
  statementDescriptor: string;
  companyName?: string;
  individualName?: string;
}): Promise<{ ok: true; data: AchTransfer } | { ok: false; error: string }> {
  return call<AchTransfer>("POST", "/ach_transfers", {
    account_id: process.env.INCREASE_ACCOUNT_ID,
    external_account_id: input.externalAccountId,
    amount: -Math.abs(input.amountCents),
    statement_descriptor: input.statementDescriptor.slice(0, 16),
    company_name: input.companyName,
    individual_name: input.individualName,
    funding: "checking",
    standard_entry_class_code: "ppd",
    require_approval: false,
  });
}

export async function getAchTransfer(id: string) {
  return call<AchTransfer>("GET", `/ach_transfers/${id}`);
}

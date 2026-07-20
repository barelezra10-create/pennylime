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

/* ─── Real-Time Payments ──────────────────────────────────────────── */

export type RtpTransfer = {
  id: string;
  account_id: string;
  amount: number;
  status: string;
  external_account_id?: string;
  remittance_information: string;
  created_at: string;
};

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

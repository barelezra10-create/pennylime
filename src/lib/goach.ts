// src/lib/goach.ts
import "server-only";
import { readFile } from "node:fs/promises";
import { goachEnv } from "@/lib/payment-processor";

export type GoachStatusMap = {
  paymentStatus: "PROCESSING" | "PAID" | "RETURNED" | "FAILED" | "CANCELED";
  isSettled: boolean;
  isReturned: boolean;
};

const SETTLED = new Set(["Funded", "Deposited", "Settled"]);
const RETURNED = new Set(["Returned", "NSF"]);

/** Pure map from a GoACH current_status (+ optional return code) to our Payment status. */
export function mapGoachStatus(current: string, returnCode: string | null | undefined): GoachStatusMap {
  if (SETTLED.has(current)) return { paymentStatus: "PAID", isSettled: true, isReturned: false };
  if (RETURNED.has(current) || (returnCode && returnCode.trim())) {
    return { paymentStatus: "RETURNED", isSettled: false, isReturned: true };
  }
  if (current === "Cancelled" || current === "Canceled") {
    return { paymentStatus: "CANCELED", isSettled: false, isReturned: false };
  }
  if (current === "Failed") return { paymentStatus: "FAILED", isSettled: false, isReturned: false };
  return { paymentStatus: "PROCESSING", isSettled: false, isReturned: false };
}

export type DailyUpdateChange = { transactionUuid: string; from: string; to: string };

/** Pure parser: pull current_status changes and the cursor out of a daily_update body. */
export function parseDailyUpdate(body: unknown): { changes: DailyUpdateChange[]; newPointer: string | null; remaining: number } {
  const b = body as { data?: Array<{ ach_transaction_uuid?: string; updates?: { current_status?: [string, string] } }>; details?: { new_pointer?: string | null; remaining_count?: number } };
  const changes: DailyUpdateChange[] = [];
  for (const row of b.data ?? []) {
    const cs = row.updates?.current_status;
    if (cs && cs.length === 2 && row.ach_transaction_uuid) {
      changes.push({ transactionUuid: row.ach_transaction_uuid, from: cs[0], to: cs[1] });
    }
  }
  return { changes, newPointer: b.details?.new_pointer ?? null, remaining: b.details?.remaining_count ?? 0 };
}

// --- HTTP layer -------------------------------------------------------------

function cfg() {
  const env = goachEnv();
  if (!env) throw new Error("GoACH not configured");
  return env;
}

export function goachConfigured(): boolean {
  return goachEnv() !== null;
}

async function req(method: string, path: string, form?: Record<string, string>, file?: { field: string; path: string }): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { apiKey, baseUrl } = cfg();
  try {
    let body: BodyInit | undefined;
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
    if (file) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form ?? {})) fd.append(k, v);
      const buf = await readFile(file.path);
      fd.append(file.field, new Blob([buf]), file.path.split("/").pop() || "poa");
      body = fd;
    } else if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: unknown; status?: string };
    if (!res.ok || (json.errors && json.status !== "success" && json.status !== "created")) {
      return { ok: false, error: typeof json.errors === "string" ? json.errors : `GoACH ${res.status}` };
    }
    return { ok: true, data: (json.data ?? {}) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GoACH network error" };
  }
}

export async function createReceiver(input: { name: string; email?: string; custom1?: string }): Promise<{ ok: true; uuid: string } | { ok: false; error: string }> {
  const form: Record<string, string> = { name: input.name };
  if (input.email) form.email = input.email;
  if (input.custom1) form.custom_1 = input.custom1;
  const r = await req("POST", "/receivers", form);
  return r.ok ? { ok: true, uuid: String(r.data.uuid) } : r;
}

export async function createBankAccount(input: { name: string; receiverUuid: string; routingNumber: string; accountNumber: string; business: boolean; checking: boolean }): Promise<{ ok: true; uuid: string } | { ok: false; error: string }> {
  const r = await req("POST", "/bank_accounts", {
    name: input.name,
    receiver_id: input.receiverUuid,
    routing_number: input.routingNumber,
    account_number: input.accountNumber,
    business: String(input.business),
    checking: String(input.checking),
  });
  return r.ok ? { ok: true, uuid: String(r.data.uuid) } : r;
}

export async function createTransaction(input: { bankAccountUuid: string; amountCents: number; type: "Debit" | "Credit"; descriptor?: string; poaFilePath?: string }): Promise<{ ok: true; uuid: string; transactionId: string; status: string } | { ok: false; error: string }> {
  const { originatorUuid } = cfg();
  const form: Record<string, string> = {
    originator_ach_account_id: originatorUuid,
    bank_account_id: input.bankAccountUuid,
    amount: (input.amountCents / 100).toFixed(2),
    transaction_type: input.type,
  };
  if (input.descriptor) form.descriptor = input.descriptor;
  const r = await req("POST", "/ach_transactions", form, input.poaFilePath ? { field: "poa_file", path: input.poaFilePath } : undefined);
  return r.ok ? { ok: true, uuid: String(r.data.uuid), transactionId: String(r.data.transaction_id ?? ""), status: String(r.data.current_status ?? "") } : r;
}

export async function getTransaction(uuid: string): Promise<{ ok: true; status: string; returnCode: string | null } | { ok: false; error: string }> {
  const r = await req("GET", `/ach_transactions/${uuid}`);
  return r.ok ? { ok: true, status: String(r.data.current_status ?? ""), returnCode: (r.data.return_code as string) ?? null } : r;
}

export async function cancelTransaction(uuid: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const r = await req("POST", `/ach_transactions/${uuid}/cancel`);
  return r.ok ? { ok: true, status: String(r.data.current_status ?? "") } : r;
}

export async function dailyUpdate(pointer?: string | null): Promise<{ ok: true; changes: DailyUpdateChange[]; newPointer: string | null; remaining: number } | { ok: false; error: string }> {
  const { apiKey, baseUrl } = cfg();
  const url = new URL(`${baseUrl}/ach_transactions/daily_update`);
  if (pointer) url.searchParams.set("pointer", pointer);
  try {
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `GoACH ${res.status}` };
    const parsed = parseDailyUpdate(await res.json());
    return { ok: true, ...parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "GoACH network error" };
  }
}

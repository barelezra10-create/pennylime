"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  goachConfigured,
  createReceiver,
  createBankAccount,
  createTransaction,
  getTransaction,
  cancelTransaction,
  mapGoachStatus,
} from "@/lib/goach";

const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
}

export type GoachTestState = {
  applicationId: string;
  firstName: string;
  lastName: string;
  plaidLinked: boolean;
  goachConfigured: boolean;
  goachReceiverUuid: string | null;
  goachBankAccountUuid: string | null;
};

/**
 * Read the current state of the fixed smoke-test application for GoACH.
 * Does NOT provision anything. Returns whether GoACH env vars are present
 * and what receiver/bank uuids (if any) are already cached on the app row.
 */
export async function getGoachTestState(): Promise<GoachTestState> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      plaidAccessToken: true,
      goachReceiverUuid: true,
      goachBankAccountUuid: true,
    },
  });
  if (!app) throw new Error(`Test application ${PLAID_TEST_APP_ID} not found`);
  return {
    applicationId: app.id,
    firstName: app.firstName,
    lastName: app.lastName,
    plaidLinked: !!app.plaidAccessToken,
    goachConfigured: goachConfigured(),
    goachReceiverUuid: app.goachReceiverUuid,
    goachBankAccountUuid: app.goachBankAccountUuid,
  };
}

/**
 * Create the GoACH receiver + bank account for the smoke-test app directly
 * from provided (or default test) routing/account numbers. Bypasses Plaid
 * entirely: GoACH staging is simulated and accepts any standard ACH numbers.
 * Caches the receiver/bank uuids on the app row (same fields the real path
 * uses) and returns them. Idempotent on the receiver.
 */
export async function provisionGoachTestManual(input: { routingNumber?: string; accountNumber?: string }): Promise<
  { ok: true; receiverUuid: string; bankAccountUuid: string } | { ok: false; error: string }
> {
  await requireAdmin();
  if (!goachConfigured()) return { ok: false, error: "GoACH not configured" };
  const routing = (input.routingNumber || "021000021").trim();
  const account = (input.accountNumber || "123456789").trim();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: { firstName: true, lastName: true, email: true, applicationCode: true, goachReceiverUuid: true },
  });
  if (!app) return { ok: false, error: `Test application ${PLAID_TEST_APP_ID} not found` };

  let receiverUuid = app.goachReceiverUuid;
  if (!receiverUuid) {
    const r = await createReceiver({ name: `${app.firstName} ${app.lastName}`.trim() || "GoACH Test", email: app.email, custom1: app.applicationCode });
    if (!r.ok) return { ok: false, error: r.error };
    receiverUuid = r.uuid;
    await prisma.application.update({ where: { id: PLAID_TEST_APP_ID }, data: { goachReceiverUuid: receiverUuid } });
  }
  const ba = await createBankAccount({ name: `${app.firstName} ${app.lastName}`.trim().slice(0, 60) || "GoACH Test", receiverUuid, routingNumber: routing, accountNumber: account, business: false, checking: true });
  if (!ba.ok) return { ok: false, error: ba.error };
  await prisma.application.update({ where: { id: PLAID_TEST_APP_ID }, data: { goachBankAccountUuid: ba.uuid } });
  return { ok: true, receiverUuid, bankAccountUuid: ba.uuid };
}

/**
 * Reset the cached GoACH receiver/bank uuids on the test app so the test can
 * be re-run cleanly (re-provision from scratch).
 */
export async function resetGoachTest(): Promise<{ ok: true }> {
  await requireAdmin();
  await prisma.application.update({ where: { id: PLAID_TEST_APP_ID }, data: { goachReceiverUuid: null, goachBankAccountUuid: null } });
  return { ok: true };
}

/**
 * Fire a GoACH debit (pull from the test app's bank to PennyLime).
 * Uses the cached bank account uuid; provision it first via provisionGoachTestManual.
 */
export async function fireGoachTestDebit(input: { amountCents: number }): Promise<
  | { ok: true; uuid: string; transactionId: string; status: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!goachConfigured()) return { ok: false, error: "GoACH not configured (missing GOACH_API_KEY or GOACH_ORIGINATOR_UUID)" };
  const app = await prisma.application.findUnique({ where: { id: PLAID_TEST_APP_ID }, select: { goachBankAccountUuid: true } });
  if (!app?.goachBankAccountUuid) return { ok: false, error: "Provision a GoACH bank account first" };
  return createTransaction({
    bankAccountUuid: app.goachBankAccountUuid,
    amountCents: Math.abs(input.amountCents),
    type: "Debit",
    descriptor: "PENNYLIME TEST",
  });
}

/**
 * Fire a GoACH credit (push from PennyLime to the test app's bank).
 * Uses the cached bank account uuid; provision it first via provisionGoachTestManual.
 */
export async function fireGoachTestCredit(input: { amountCents: number }): Promise<
  | { ok: true; uuid: string; transactionId: string; status: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!goachConfigured()) return { ok: false, error: "GoACH not configured (missing GOACH_API_KEY or GOACH_ORIGINATOR_UUID)" };
  const app = await prisma.application.findUnique({ where: { id: PLAID_TEST_APP_ID }, select: { goachBankAccountUuid: true } });
  if (!app?.goachBankAccountUuid) return { ok: false, error: "Provision a GoACH bank account first" };
  return createTransaction({
    bankAccountUuid: app.goachBankAccountUuid,
    amountCents: Math.abs(input.amountCents),
    type: "Credit",
    descriptor: "PENNYLIME TEST",
  });
}

/**
 * Poll GoACH for the current status of a transaction by its uuid.
 * Returns both the raw GoACH current_status and our mapped Payment status.
 */
export async function getGoachTestStatus(uuid: string): Promise<
  | { ok: true; status: string; returnCode: string | null; mappedStatus: ReturnType<typeof mapGoachStatus> }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const r = await getTransaction(uuid);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    status: r.status,
    returnCode: r.returnCode,
    mappedStatus: mapGoachStatus(r.status, r.returnCode),
  };
}

/**
 * Cancel a GoACH transaction by its uuid.
 */
export async function cancelGoachTest(uuid: string): Promise<
  { ok: true; status: string } | { ok: false; error: string }
> {
  await requireAdmin();
  return cancelTransaction(uuid);
}

"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  goachConfigured,
  createTransaction,
  getTransaction,
  cancelTransaction,
  mapGoachStatus,
} from "@/lib/goach";
import { ensureGoachBankAccount } from "@/lib/goach-provision";

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
 * Create the GoACH receiver + bank account for the smoke-test app using its
 * Plaid sandbox ACH numbers. Idempotent: cached uuids are returned as-is.
 */
export async function provisionGoachTest(): Promise<
  { ok: true; receiverUuid: string; bankAccountUuid: string } | { ok: false; error: string }
> {
  await requireAdmin();
  return ensureGoachBankAccount(PLAID_TEST_APP_ID);
}

/**
 * Fire a GoACH debit (pull from the test app's bank to PennyLime).
 */
export async function fireGoachTestDebit(input: { amountCents: number }): Promise<
  | { ok: true; uuid: string; transactionId: string; status: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!goachConfigured()) return { ok: false, error: "GoACH not configured (missing GOACH_API_KEY or GOACH_ORIGINATOR_UUID)" };
  const provision = await ensureGoachBankAccount(PLAID_TEST_APP_ID);
  if (!provision.ok) return { ok: false, error: provision.error };
  return createTransaction({
    bankAccountUuid: provision.bankAccountUuid,
    amountCents: Math.abs(input.amountCents),
    type: "Debit",
    descriptor: "PENNYLIME TEST",
  });
}

/**
 * Fire a GoACH credit (push from PennyLime to the test app's bank).
 */
export async function fireGoachTestCredit(input: { amountCents: number }): Promise<
  | { ok: true; uuid: string; transactionId: string; status: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!goachConfigured()) return { ok: false, error: "GoACH not configured (missing GOACH_API_KEY or GOACH_ORIGINATOR_UUID)" };
  const provision = await ensureGoachBankAccount(PLAID_TEST_APP_ID);
  if (!provision.ok) return { ok: false, error: provision.error };
  return createTransaction({
    bankAccountUuid: provision.bankAccountUuid,
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

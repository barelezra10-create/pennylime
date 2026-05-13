"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureIncreaseExternalAccount } from "@/actions/plaid";
import { createAchCredit, createAchDebit, getAchTransfer } from "@/lib/increase";

const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
}

export type IncreaseTestState = {
  applicationId: string;
  firstName: string;
  lastName: string;
  plaidLinked: boolean;
  lastExternalAccountId: string | null;
  lastCreditTransferId: string | null;
  lastDebitTransferId: string | null;
};

/**
 * Read the current state of the fixed Plaid smoke-test application, which
 * we reuse for Increase ACH tests too. The app must already be linked to
 * a Plaid sandbox bank — go through /admin/plaid-test first if not.
 */
export async function getIncreaseTestState(): Promise<IncreaseTestState> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      plaidAccessToken: true,
      increaseTransferId: true,
    },
  });
  if (!app) throw new Error(`Test application ${PLAID_TEST_APP_ID} not found`);
  return {
    applicationId: app.id,
    firstName: app.firstName,
    lastName: app.lastName,
    plaidLinked: !!app.plaidAccessToken,
    lastExternalAccountId: null, // re-derived on demand below
    lastCreditTransferId: app.increaseTransferId,
    lastDebitTransferId: null,
  };
}

/**
 * Resolve or create the Increase ExternalAccount for the smoke-test app.
 * Returns the ID so the UI can show it and reuse it for subsequent debits.
 */
export async function ensureExternalAccountForTest() {
  await requireAdmin();
  return ensureIncreaseExternalAccount(PLAID_TEST_APP_ID);
}

/**
 * Push money from PennyLime to the linked Plaid bank via Increase ACH credit.
 * Sandbox simulates the full ACH flow; production moves real money.
 */
export async function fireTestCredit(input: { amountCents: number }) {
  await requireAdmin();
  const ext = await ensureIncreaseExternalAccount(PLAID_TEST_APP_ID);
  if (!ext.ok) return { ok: false as const, error: ext.error };
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: { firstName: true, lastName: true },
  });
  const result = await createAchCredit({
    externalAccountId: ext.externalAccountId,
    amountCents: Math.abs(input.amountCents),
    statementDescriptor: "PENNYLIME TEST",
    individualName: `${app?.firstName ?? "Test"} ${app?.lastName ?? "User"}`.slice(0, 22),
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  await prisma.application.update({
    where: { id: PLAID_TEST_APP_ID },
    data: {
      increaseTransferId: result.data.id,
      increaseTransferStatus: "pending_submission",
    },
  });
  return {
    ok: true as const,
    transferId: result.data.id,
    externalAccountId: ext.externalAccountId,
  };
}

/**
 * Pull money from the linked Plaid bank to PennyLime via Increase ACH debit.
 */
export async function fireTestDebit(input: { amountCents: number }) {
  await requireAdmin();
  const ext = await ensureIncreaseExternalAccount(PLAID_TEST_APP_ID);
  if (!ext.ok) return { ok: false as const, error: ext.error };
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: { firstName: true, lastName: true },
  });
  const result = await createAchDebit({
    externalAccountId: ext.externalAccountId,
    amountCents: Math.abs(input.amountCents),
    statementDescriptor: "PENNYLIME TEST",
    individualName: `${app?.firstName ?? "Test"} ${app?.lastName ?? "User"}`.slice(0, 22),
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    transferId: result.data.id,
    externalAccountId: ext.externalAccountId,
  };
}

/**
 * Look up the current Increase status of an ACH transfer by ID.
 * Webhook usually has the freshest info but this is the polled fallback
 * (and convenient when admin wants to see "what does Increase say right
 * now" without waiting for the webhook to fire).
 */
export async function getIncreaseTransferStatusById(transferId: string) {
  await requireAdmin();
  const resp = await getAchTransfer(transferId);
  if (!resp.ok) return { ok: false as const, error: resp.error };
  return { ok: true as const, data: resp.data };
}

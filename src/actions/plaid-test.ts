"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

export const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
}

export type PlaidTestAppState = {
  plaidItemId: string | null;
  plaidAccountId: string | null;
  plaidAccessTokenStored: boolean;
  plaidLinkStale: boolean;
  monthlyIncome: number | null;
  bankBalance: number | null;
};

export async function getPlaidTestAppState(): Promise<PlaidTestAppState> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: {
      plaidItemId: true,
      plaidAccountId: true,
      plaidAccessToken: true,
      plaidLinkStale: true,
      monthlyIncome: true,
      bankBalance: true,
    },
  });
  if (!app) {
    throw new Error(`Test application ${PLAID_TEST_APP_ID} not found. Did the seed run?`);
  }
  return {
    plaidItemId: app.plaidItemId,
    plaidAccountId: app.plaidAccountId,
    plaidAccessTokenStored: !!app.plaidAccessToken,
    plaidLinkStale: app.plaidLinkStale,
    monthlyIncome: app.monthlyIncome ? Number(app.monthlyIncome) : null,
    bankBalance: app.bankBalance ? Number(app.bankBalance) : null,
  };
}

export async function persistPlaidLinkToTestApp(input: {
  accessToken: string; // already encrypted by /api/plaid/exchange-token
  itemId: string;
  accountId: string | null;
}) {
  await requireAdmin();
  await prisma.application.update({
    where: { id: PLAID_TEST_APP_ID },
    data: {
      plaidAccessToken: input.accessToken,
      plaidItemId: input.itemId,
      plaidAccountId: input.accountId,
      plaidLinkStale: false,
    },
  });
  return { ok: true as const };
}

export async function resetTestApp() {
  await requireAdmin();
  await prisma.application.update({
    where: { id: PLAID_TEST_APP_ID },
    data: {
      plaidAccessToken: null,
      plaidAccountId: null,
      plaidItemId: null,
      plaidLinkStale: false,
      monthlyIncome: null,
      bankBalance: null,
      increaseTransferId: null,
      increaseTransferStatus: null,
      increaseDisburseError: null,
    },
  });
  return { ok: true as const };
}

export type PlaidDebugDump = {
  ok: true;
  auth: unknown;
  identity: unknown;
  transactions: unknown;
} | {
  ok: false;
  error: string;
};

export async function getPlaidDebugDump(): Promise<PlaidDebugDump> {
  await requireAdmin();
  const app = await prisma.application.findUnique({
    where: { id: PLAID_TEST_APP_ID },
    select: { plaidAccessToken: true },
  });
  if (!app?.plaidAccessToken) {
    return { ok: false, error: "No Plaid token on test app. Run pipeline first." };
  }
  let accessToken: string;
  try {
    accessToken = decrypt(app.plaidAccessToken);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "decrypt failed" };
  }
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const [auth, identity, transactions] = await Promise.all([
      plaidClient.authGet({ access_token: accessToken }),
      plaidClient.identityGet({ access_token: accessToken }),
      plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: threeMonthsAgo.toISOString().split("T")[0],
        end_date: now.toISOString().split("T")[0],
      }),
    ]);
    return {
      ok: true,
      auth: auth.data,
      identity: identity.data,
      transactions: transactions.data,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errorMessage };
  }
}

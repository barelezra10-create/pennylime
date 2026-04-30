"use server";

import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

export async function fetchAndStoreIncome(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application?.plaidAccessToken) {
    return { success: false, error: "No Plaid connection" };
  }

  try {
    const accessToken = decrypt(application.plaidAccessToken);

    // Use Transactions to estimate income (3-month deposit average)
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const txResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    });

    // Sum deposit transactions (Plaid: negative amount = money in)
    const deposits = txResponse.data.transactions
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const monthlyIncome = deposits / 3;

    await prisma.application.update({
      where: { id: applicationId },
      data: { monthlyIncome },
    });

    // Fetch and store bank balance
    try {
      const balanceResponse = await plaidClient.accountsBalanceGet({
        access_token: accessToken,
      });
      const account = balanceResponse.data.accounts.find(
        (a) => a.account_id === application.plaidAccountId
      );
      if (account?.balances?.current != null) {
        await prisma.application.update({
          where: { id: applicationId },
          data: { bankBalance: account.balances.current },
        });
      }
    } catch (balanceError) {
      console.warn("Failed to fetch bank balance:", balanceError);
      // Non-fatal: income was already stored, balance is optional
    }

    return { success: true, monthlyIncome };
  } catch (error) {
    console.error("Plaid income fetch error:", error);
    return { success: false, error: "Could not verify income" };
  }
}

export async function getPlaidIncomeData(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { monthlyIncome: true, plaidAccessToken: true },
  });

  return {
    monthlyIncome: application?.monthlyIncome ? Number(application.monthlyIncome) : null,
    hasPlaidConnection: !!application?.plaidAccessToken,
  };
}

/**
 * Fetch the merchant's account & routing numbers from Plaid Auth and create
 * an Increase ExternalAccount we can later use to push/pull ACH.
 * Returns the Increase external_account_id (cached on the Application).
 */
export async function ensureIncreaseExternalAccount(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { contact: true },
  });
  if (!application?.plaidAccessToken) return { ok: false, error: "no plaid connection" } as const;

  const { createExternalAccount } = await import("@/lib/increase");

  let accessToken: string;
  try {
    accessToken = decrypt(application.plaidAccessToken);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "decrypt failed" } as const;
  }

  let authResp;
  try {
    authResp = await plaidClient.authGet({ access_token: accessToken });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "plaid auth failed" } as const;
  }

  const targetAccount = application.plaidAccountId
    ? authResp.data.numbers.ach.find((n) => n.account_id === application.plaidAccountId)
    : authResp.data.numbers.ach[0];

  if (!targetAccount) return { ok: false, error: "no ACH account on Plaid item" } as const;

  const create = await createExternalAccount({
    routingNumber: targetAccount.routing,
    accountNumber: targetAccount.account,
    description: `${application.firstName} ${application.lastName} (${application.applicationCode})`,
    accountHolder: "individual",
    funding: "checking",
  });

  if (!create.ok) return { ok: false, error: create.error } as const;
  return { ok: true, externalAccountId: create.data.id } as const;
}

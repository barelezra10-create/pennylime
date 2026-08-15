import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

/**
 * Pull the borrower's live bank balance from Plaid and store it on the
 * application (bankBalance + lastPlaidRefresh). Used by the daily balance
 * sweep so collections can see, per account, whether there's money to collect.
 * Balance is a core Plaid product (unlike Transactions, which this client
 * isn't entitled to), so this works where transactionsGet does not.
 */
export async function refreshBankBalance(
  applicationId: string,
): Promise<{ ok: true; balance: number | null } | { ok: false; error: string }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { plaidAccessToken: true, plaidAccountId: true },
  });
  if (!app?.plaidAccessToken) return { ok: false, error: "No Plaid connection" };

  let token: string;
  try {
    token = decrypt(app.plaidAccessToken);
  } catch {
    return { ok: false, error: "Could not decrypt Plaid token" };
  }

  try {
    const resp = await plaidClient.accountsBalanceGet({ access_token: token });
    const acct = app.plaidAccountId
      ? resp.data.accounts.find((a) => a.account_id === app.plaidAccountId) ?? resp.data.accounts[0]
      : resp.data.accounts[0];
    const balance = acct?.balances?.current ?? null;
    await prisma.application.update({
      where: { id: applicationId },
      data: { bankBalance: balance, lastPlaidRefresh: new Date() },
    });
    return { ok: true, balance };
  } catch (err) {
    const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
    const detail = data?.error_code
      ? `Plaid ${data.error_code}: ${data.error_message ?? ""}`.trim()
      : err instanceof Error
        ? err.message
        : "Balance fetch failed";
    return { ok: false, error: detail };
  }
}

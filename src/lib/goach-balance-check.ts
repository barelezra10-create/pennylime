import "server-only";
import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

export type DebitContext = { applicationId: string; paymentId?: string };
export type DebitBlocked = { ok: false; skipped: true; error: string };

/** Only a fresh USD available balance for the payment account can block for insufficient funds. */
export async function checkGoachDebitBalance(input: DebitContext & { bankAccountUuid: string; amountCents: number }): Promise<{ ok: true } | DebitBlocked> {
  let available: number | null = null;
  let reason = "Payment account could not be verified. No charge was sent.";
  let insufficient = false;
  let unavailableReason: string | null = null;
  try {
    const app = await prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { plaidAccessToken: true, plaidAccountId: true, goachBankAccountUuid: true, bankAccountNumberManual: true },
    });
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      reason = "Invalid payment amount. No charge was sent.";
    } else if (!app || !input.bankAccountUuid || app.goachBankAccountUuid !== input.bankAccountUuid) {
      reason = "Payment bank account does not match this application. No charge was sent.";
    } else {
      if (!app.plaidAccessToken || !app.plaidAccountId || app.bankAccountNumberManual) {
        unavailableReason = "No Plaid balance connection for the payment account.";
      } else {
        try {
          const response = await plaidClient.accountsBalanceGet({ access_token: decrypt(app.plaidAccessToken), options: { account_ids: [app.plaidAccountId] } }, { timeout: 30_000 });
          const account = response.data.accounts.find(value => value.account_id === app.plaidAccountId);
          const balance = account?.balances.available;
          if (typeof balance === "number" && Number.isFinite(balance) && account?.balances.iso_currency_code === "USD") {
            available = balance;
            // Decide before caching: a persistence failure must not bypass a known shortage.
            insufficient = Math.round(balance * 100) < input.amountCents;
            if (insufficient) reason = `Not enough available balance: $${balance.toFixed(2)} available for a $${(input.amountCents / 100).toFixed(2)} payment. No charge was sent.`;
            try {
              await prisma.application.update({ where: { id: input.applicationId }, data: { availableBalance: balance, bankBalance: account.balances.current, lastPlaidRefresh: new Date() } });
            } catch { /* Balance decision remains valid even if the cache update fails. */ }
            if (!insufficient) return { ok: true };
          } else unavailableReason = "Plaid did not return a usable USD available balance for the payment account.";
        } catch {
          unavailableReason = "Plaid balance lookup unavailable; bank reconnection or retry may be required.";
        }
      }
      if (unavailableReason && !insufficient) {
        // This is permission to continue other debit checks, not evidence of sufficient funds or a submitted charge.
        await logAudit({ action: "PAYMENT_BALANCE_UNAVAILABLE", entityType: "APPLICATION", entityId: input.applicationId,
          performedBy: "system:balance-check", details: { paymentId: input.paymentId, amount: input.amountCents / 100, availableBalance: null, reason: unavailableReason, decision: "proceed_without_balance" } });
        return { ok: true };
      }
    }
  } catch {
    // Database/account validation and audit failures are not Plaid balance failures.
  }

  try {
    await logAudit({
      action: "PAYMENT_SKIPPED_BALANCE", entityType: "APPLICATION", entityId: input.applicationId,
      performedBy: "system:balance-check",
      details: { paymentId: input.paymentId, amount: input.amountCents / 100, availableBalance: available, reason, insufficient },
    });
    if (input.paymentId) {
      await prisma.payment.update({ where: { id: input.paymentId }, data: { increaseLastError: `Balance check: ${reason}` } });
      const last = await prisma.paymentAttempt.findFirst({ where: { paymentId: input.paymentId }, orderBy: { attemptNumber: "desc" }, select: { attemptNumber: true } });
      await prisma.paymentAttempt.create({ data: {
        paymentId: input.paymentId, attemptNumber: (last?.attemptNumber ?? 0) + 1,
        initiatedBy: "system:balance-check", amount: input.amountCents / 100,
        increaseTransferStatus: "not_submitted", finalStatus: "SKIPPED", returnReason: reason,
      } });
    }
  } catch (error) {
    console.error("Unable to record blocked GoACH debit", { applicationId: input.applicationId, paymentId: input.paymentId, error });
  }
  return { ok: false, skipped: true, error: reason };
}

import { prisma } from "@/lib/db";

/**
 * Initiate an ACH debit for a scheduled payment via Increase.
 *
 * Disbursement credits and repayment debits both run through Increase
 * (despite this file being named plaid-transfer.ts — the name predates
 * the migration off Plaid Transfer). The Increase ExternalAccount is
 * lazily created from Plaid Auth's routing/account numbers via
 * ensureIncreaseExternalAccount; it returns the same id on repeat calls
 * so we don't accumulate ExternalAccount rows.
 *
 * Returns the Increase ach_transfer.id on success.
 */
export async function initiateACHDebit(paymentId: string): Promise<
  { success: true; transferId: string; processor: "increase" | "goach" } | { success: false; error: string }
> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (!payment.application.plaidAccessToken) {
    return { success: false, error: "No bank connection on application" };
  }

  const totalAmount = Number(payment.amount) + Number(payment.lateFee);
  const amountCents = Math.round(totalAmount * 100);

  const { getPaymentProcessor } = await import("@/lib/payment-processor");
  const processor = await getPaymentProcessor();
  if (processor === "goach") {
    const { goachConfigured, createTransaction } = await import("@/lib/goach");
    if (!goachConfigured()) return { success: false, error: "GoACH not configured" };
    const { ensureGoachBankAccount } = await import("@/lib/goach-provision");
    const prov = await ensureGoachBankAccount(payment.applicationId);
    if (!prov.ok) return { success: false, error: prov.error };
    const tx = await createTransaction({ bankAccountUuid: prov.bankAccountUuid, amountCents, type: "Debit", descriptor: "PENNYLIME PMT" });
    if (!tx.ok) return { success: false, error: tx.error };
    return { success: true, transferId: tx.uuid, processor: "goach" as const };
  }

  // Resolve or create the Increase ExternalAccount for this application.
  const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
  const ext = await ensureIncreaseExternalAccount(payment.applicationId);
  if (!ext.ok) {
    return { success: false, error: ext.error };
  }

  const { safeDebit } = await import("@/lib/increase");
  // safeDebit tries Same-Day ACH first (money in our account by EOD)
  // and falls back to standard ACH on 400s (past the ~2:45pm ET cutoff,
  // destination doesn't support same-day, etc).
  const result = await safeDebit({
    externalAccountId: ext.externalAccountId,
    amountCents,
    statementDescriptor: "PENNYLIME PMT",
    individualName: `${payment.application.firstName} ${payment.application.lastName}`.slice(0, 22),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  if (result.rail === "ach") {
    console.log(`[debit] payment ${paymentId} via standard ACH (same-day rejected)`);
  } else {
    console.log(`[debit] payment ${paymentId} via ${result.rail}`);
  }
  return { success: true, transferId: result.transferId, processor: "increase" as const };
}

/**
 * Check the status of an Increase ACH transfer for a queued/processing
 * payment. The webhook handles the realtime case; this is the cron-driven
 * pull for missed events.
 *
 * Maps Increase's transfer states onto our four buckets so the rest of
 * the app doesn't have to know Increase-specific status strings.
 */
export async function checkTransferStatus(
  transferId: string
): Promise<"posted" | "failed" | "cancelled" | "pending"> {
  try {
    const { getAchTransfer } = await import("@/lib/increase");
    const resp = await getAchTransfer(transferId);
    if (!resp.ok) return "pending";
    const status = resp.data.status as string;
    if (status === "submitted" || status === "settled") return "posted";
    if (status === "returned" || status === "failed") return "failed";
    if (status === "canceled" || status === "cancelled") return "cancelled";
    return "pending";
  } catch (error) {
    console.error("Increase transfer status check error:", error);
    return "pending";
  }
}

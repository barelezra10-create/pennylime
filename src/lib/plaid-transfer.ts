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
  { success: true; transferId: string } | { success: false; error: string }
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

  // Resolve or create the Increase ExternalAccount for this application.
  const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
  const ext = await ensureIncreaseExternalAccount(payment.applicationId);
  if (!ext.ok) {
    return { success: false, error: ext.error };
  }

  const { createAchDebit } = await import("@/lib/increase");
  // Same-Day ACH if we're before Increase's ~2pm ET cutoff. Money posts
  // into our Increase account by EOD instead of T+1/T+2. Past cutoff
  // Increase silently downgrades to standard ACH, so we always pass
  // true and let Increase pick the fastest available rail.
  const result = await createAchDebit({
    externalAccountId: ext.externalAccountId,
    amountCents,
    statementDescriptor: "PENNYLIME PMT",
    individualName: `${payment.application.firstName} ${payment.application.lastName}`.slice(0, 22),
    sameDay: true,
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true, transferId: result.data.id };
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

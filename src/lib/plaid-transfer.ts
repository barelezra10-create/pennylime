import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/db";
import { TransferType, TransferNetwork, ACHClass } from "plaid";

/**
 * Initiate an ACH debit via Plaid Transfer for a payment.
 * Returns the transfer ID on success, or an error message.
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
    return { success: false, error: "No Plaid connection" };
  }

  const accessToken = decrypt(payment.application.plaidAccessToken);
  const accountId = payment.application.plaidAccountId;
  if (!accountId) return { success: false, error: "No Plaid account ID" };

  const totalAmount = Number(payment.amount) + Number(payment.lateFee);

  try {
    // Step 1: Authorize the transfer
    const authResponse = await plaidClient.transferAuthorizationCreate({
      access_token: accessToken,
      account_id: accountId,
      type: TransferType.Debit,
      network: TransferNetwork.Ach,
      amount: totalAmount.toFixed(2),
      ach_class: ACHClass.Web,
      user: {
        legal_name: `${payment.application.firstName} ${payment.application.lastName}`,
      },
    });

    const authorization = authResponse.data.authorization;
    if (authorization.decision !== "approved") {
      return {
        success: false,
        error: `Transfer not authorized: ${authorization.decision_rationale?.description || authorization.decision}`,
      };
    }

    // Step 2: Create the transfer
    const transferResponse = await plaidClient.transferCreate({
      access_token: accessToken,
      account_id: accountId,
      authorization_id: authorization.id,
      amount: totalAmount.toFixed(2),
      description: `Payment #${payment.paymentNumber}`,
    });

    return { success: true, transferId: transferResponse.data.transfer.id };
  } catch (error) {
    console.error("Plaid Transfer error:", error);
    return { success: false, error: "ACH transfer initiation failed" };
  }
}

/**
 * Check the status of a Plaid Transfer.
 * Returns "posted" (success), "failed", "cancelled", or "pending" (still processing).
 */
export async function checkTransferStatus(
  transferId: string
): Promise<"posted" | "failed" | "cancelled" | "pending"> {
  try {
    const response = await plaidClient.transferGet({ transfer_id: transferId });
    const status = response.data.transfer.status;

    if (status === "posted" || status === "settled") return "posted";
    if (status === "failed" || status === "returned") return "failed";
    if (status === "cancelled") return "cancelled";
    return "pending"; // still in transit
  } catch (error) {
    console.error("Plaid Transfer status check error:", error);
    return "pending"; // safe default: don't mark as failed on API error
  }
}

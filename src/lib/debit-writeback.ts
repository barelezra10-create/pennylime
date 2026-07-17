import "server-only";
import { prisma } from "@/lib/db";
import { getPaymentProcessor } from "@/lib/payment-processor";

/**
 * Persist a freshly-initiated debit's transfer id onto the Payment in the
 * processor-correct columns. transferId is the Increase transfer id or the
 * GoACH transaction uuid depending on the active processor. increaseTransferId
 * is ALSO set because it is the lookup key PaymentAttempt uses for both processors.
 */
export async function applyDebitInitiation(paymentId: string, transferId: string): Promise<void> {
  const processor = await getPaymentProcessor();
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      processor,
      achTransferId: transferId,
      increaseTransferId: transferId,
      increaseTransferStatus: "pending_submission",
      ...(processor === "goach" ? { goachTransactionUuid: transferId } : {}),
    },
  });
}

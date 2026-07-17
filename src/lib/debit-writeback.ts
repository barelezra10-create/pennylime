import "server-only";
import { prisma } from "@/lib/db";
import type { ProcessorName } from "@/lib/payment-processor";

/**
 * Persist a freshly-initiated debit's transfer id onto the Payment in the
 * processor-correct columns. transferId is the Increase transfer id or the
 * GoACH transaction uuid depending on the active processor. increaseTransferId
 * is ALSO set because it is the lookup key PaymentAttempt uses for both processors.
 *
 * The processor is passed in from the caller (threaded from initiateACHDebit)
 * rather than re-read from config, so the label always matches the actual
 * processor that fired the debit even if an admin flips the switch mid-flight.
 */
export async function applyDebitInitiation(paymentId: string, transferId: string, processor: ProcessorName): Promise<void> {
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

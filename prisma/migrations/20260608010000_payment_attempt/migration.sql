-- One row per ACH initiation against a Payment. Lets us track full
-- retry history instead of overwriting transferId on each attempt.
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiatedBy" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "increaseTransferId" TEXT,
    "increaseTransferStatus" TEXT,
    "finalStatus" TEXT,
    "settledAt" TIMESTAMP(3),
    "returnReason" TEXT,
    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAttempt_paymentId_attemptNumber_idx" ON "PaymentAttempt"("paymentId", "attemptNumber");
CREATE INDEX "PaymentAttempt_increaseTransferId_idx" ON "PaymentAttempt"("increaseTransferId");

ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

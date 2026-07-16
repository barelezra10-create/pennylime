-- AlterTable: add GoACH processor fields to Payment
ALTER TABLE "Payment" ADD COLUMN "processor" TEXT;
ALTER TABLE "Payment" ADD COLUMN "goachTransactionUuid" TEXT;

-- AlterTable: add GoACH receiver/bank/disburse UUIDs to Application
ALTER TABLE "Application" ADD COLUMN "goachReceiverUuid" TEXT;
ALTER TABLE "Application" ADD COLUMN "goachBankAccountUuid" TEXT;
ALTER TABLE "Application" ADD COLUMN "goachDisburseUuid" TEXT;

-- AlterTable: add payment processor switch and daily update pointer to TrackingConfig
ALTER TABLE "TrackingConfig" ADD COLUMN "paymentProcessor" TEXT NOT NULL DEFAULT 'increase';
ALTER TABLE "TrackingConfig" ADD COLUMN "goachDailyUpdatePointer" TEXT;

-- CreateIndex: unique constraint on GoACH transaction UUID
CREATE UNIQUE INDEX "Payment_goachTransactionUuid_key" ON "Payment"("goachTransactionUuid");

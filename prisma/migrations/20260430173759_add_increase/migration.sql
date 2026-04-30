-- AlterTable
ALTER TABLE "Application" ADD COLUMN "increaseDisburseError" TEXT;
ALTER TABLE "Application" ADD COLUMN "increaseTransferId" TEXT;
ALTER TABLE "Application" ADD COLUMN "increaseTransferStatus" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "increaseLastError" TEXT;
ALTER TABLE "Payment" ADD COLUMN "increaseTransferId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "increaseTransferStatus" TEXT;

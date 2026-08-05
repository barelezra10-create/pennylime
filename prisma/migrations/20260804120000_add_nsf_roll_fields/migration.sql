-- NSF roll-to-end tracking on Payment (idempotent)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rollCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "isLateFee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rolledFromPaymentId" TEXT;

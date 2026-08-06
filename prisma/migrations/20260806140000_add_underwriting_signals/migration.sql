-- Underwriting risk signals from the 90-day statements (idempotent)
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "nsfCount90d" INTEGER;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "daysNegative90d" INTEGER;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "minBalance90d" DECIMAL(65,30);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "lastDepositAt" TIMESTAMP(3);

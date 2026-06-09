-- Running total of money collected against a Payment via successful
-- ACH attempts (full retries + partial micro-collections). Lets the
-- platform support smaller debits that chip away at the outstanding.
ALTER TABLE "Payment" ADD COLUMN "collectedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Backfill: any existing PAID payment is fully collected.
UPDATE "Payment" SET "collectedAmount" = "amount" WHERE "status" = 'PAID';

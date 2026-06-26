-- Repayment cadence (WEEKLY default / DAILY) chosen in the funnel.
ALTER TABLE "Application" ADD COLUMN "paymentFrequency" TEXT NOT NULL DEFAULT 'WEEKLY';

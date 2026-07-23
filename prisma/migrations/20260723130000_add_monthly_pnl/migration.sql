-- Add monthly P&L JSON to Application (idempotent)
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "monthlyPnlJson" TEXT;

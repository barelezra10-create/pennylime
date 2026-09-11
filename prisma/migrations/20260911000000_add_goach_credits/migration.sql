-- Track individual GoACH ACH credits for split disbursements (>$1,000 advances
-- are sent as multiple <=$1,000 credits). JSON array persisted per credit so a
-- retry only sends the remaining amount and never double-pays the borrower.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "goachCreditsJson" TEXT;

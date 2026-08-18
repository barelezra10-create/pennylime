-- What the applicant needs the advance for (business-expense purpose) + detail.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "advancePurpose" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "advancePurposeDetail" TEXT;

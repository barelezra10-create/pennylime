-- EIN + work-verification fields for the Documents step.
ALTER TABLE "Application" ADD COLUMN "ein" TEXT;
ALTER TABLE "Application" ADD COLUMN "workVerificationStatus" TEXT;
ALTER TABLE "Application" ADD COLUMN "workVerificationJson" TEXT;
ALTER TABLE "Application" ADD COLUMN "workVerificationAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "workNeedsReview" BOOLEAN NOT NULL DEFAULT false;

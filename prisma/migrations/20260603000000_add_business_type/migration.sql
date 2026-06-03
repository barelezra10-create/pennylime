-- For BUSINESS_OWNER applicants: industry/category they operate in
-- (Restaurant, Retail, Trades, Services, etc.). "Other: <desc>" when
-- the applicant picks "Other" and types a custom description.
ALTER TABLE "Application" ADD COLUMN "businessType" TEXT;

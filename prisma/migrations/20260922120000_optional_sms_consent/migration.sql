-- New contacts need explicit consent. Existing preferences are preserved.
ALTER TABLE "Contact" ALTER COLUMN "smsOptIn" SET DEFAULT false;

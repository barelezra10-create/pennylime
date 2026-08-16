-- Track when we last emailed an applicant asking for something, cleared on their reply.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "awaitingReplySince" TIMESTAMP(3);

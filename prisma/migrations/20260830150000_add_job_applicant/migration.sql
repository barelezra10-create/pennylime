-- Careers / recruiting: candidates who apply through the public /hr page.
CREATE TABLE IF NOT EXISTS "JobApplicant" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "linkedin" TEXT,
  "yearsExperience" TEXT,
  "mcaExperience" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT,
  "role" TEXT NOT NULL DEFAULT 'Underwriter',
  "cvStoragePath" TEXT NOT NULL,
  "cvFileName" TEXT NOT NULL,
  "cvMimeType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "invitedAt" TIMESTAMP(3),
  "proposedTimes" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobApplicant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobApplicant_status_idx" ON "JobApplicant"("status");
CREATE INDEX IF NOT EXISTS "JobApplicant_createdAt_idx" ON "JobApplicant"("createdAt");

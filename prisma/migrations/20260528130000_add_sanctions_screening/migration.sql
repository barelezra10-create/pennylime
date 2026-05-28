-- CreateTable
CREATE TABLE "SanctionsScreening" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "addressCountry" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'opensanctions',
    "status" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanctionsScreening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SanctionsScreening_applicationId_idx" ON "SanctionsScreening"("applicationId");

-- CreateIndex
CREATE INDEX "SanctionsScreening_status_idx" ON "SanctionsScreening"("status");

-- CreateIndex
CREATE INDEX "SanctionsScreening_screenedAt_idx" ON "SanctionsScreening"("screenedAt");

-- CreateTable
CREATE TABLE "AdvanceTopUpRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contactId" TEXT,
    "requestedAmount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvanceTopUpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvanceTopUpRequest_applicationId_idx" ON "AdvanceTopUpRequest"("applicationId");

-- CreateIndex
CREATE INDEX "AdvanceTopUpRequest_contactId_idx" ON "AdvanceTopUpRequest"("contactId");

-- CreateIndex
CREATE INDEX "AdvanceTopUpRequest_status_idx" ON "AdvanceTopUpRequest"("status");

-- CreateIndex
CREATE INDEX "AdvanceTopUpRequest_createdAt_idx" ON "AdvanceTopUpRequest"("createdAt");

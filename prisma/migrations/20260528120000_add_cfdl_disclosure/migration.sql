-- CreateTable
CREATE TABLE "CfdlDisclosure" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "disbursedAmount" DECIMAL(65,30) NOT NULL,
    "totalRepayment" DECIMAL(65,30) NOT NULL,
    "financeCharge" DECIMAL(65,30) NOT NULL,
    "aprPercent" DOUBLE PRECISION NOT NULL,
    "termDays" INTEGER NOT NULL,
    "specifiedPercent" DOUBLE PRECISION NOT NULL,
    "weeklyPayment" DECIMAL(65,30) NOT NULL,
    "signedName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "scrolledToBottom" BOOLEAN NOT NULL DEFAULT false,
    "templateVersion" TEXT NOT NULL DEFAULT 'v1-2026-05-28',
    "bodyHash" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfdlDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CfdlDisclosure_applicationId_idx" ON "CfdlDisclosure"("applicationId");

-- CreateIndex
CREATE INDEX "CfdlDisclosure_state_idx" ON "CfdlDisclosure"("state");

-- CreateIndex
CREATE INDEX "CfdlDisclosure_signedAt_idx" ON "CfdlDisclosure"("signedAt");

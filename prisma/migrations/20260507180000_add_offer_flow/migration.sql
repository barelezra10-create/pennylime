-- AlterTable
ALTER TABLE "Application"
  ADD COLUMN "offerStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "offeredMinAmount" DECIMAL(65,30),
  ADD COLUMN "offeredMaxAmount" DECIMAL(65,30),
  ADD COLUMN "offeredTermsJson" TEXT,
  ADD COLUMN "offerToken" TEXT,
  ADD COLUMN "offerSentAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAmount" DECIMAL(65,30),
  ADD COLUMN "acceptedTermIndex" INTEGER,
  ADD COLUMN "acceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Application_offerToken_key" ON "Application"("offerToken");

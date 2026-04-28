-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "phoneVerifiedAt" DATETIME;

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "contactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_idx" ON "PhoneVerification"("phone");

-- CreateIndex
CREATE INDEX "PhoneVerification_createdAt_idx" ON "PhoneVerification"("createdAt");

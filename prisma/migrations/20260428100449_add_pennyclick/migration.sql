-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "pennyClickId" TEXT;

-- CreateTable
CREATE TABLE "PennyClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "firstUtmSource" TEXT,
    "firstUtmMedium" TEXT,
    "firstUtmCampaign" TEXT,
    "firstUtmTerm" TEXT,
    "firstUtmContent" TEXT,
    "firstGclid" TEXT,
    "firstGbraid" TEXT,
    "firstWbraid" TEXT,
    "firstFbclid" TEXT,
    "firstTtclid" TEXT,
    "firstMsclkid" TEXT,
    "firstLandingPage" TEXT,
    "firstReferrer" TEXT,
    "firstUserAgent" TEXT,
    "firstIpAddress" TEXT,
    "lastUtmSource" TEXT,
    "lastUtmMedium" TEXT,
    "lastUtmCampaign" TEXT,
    "lastGclid" TEXT,
    "lastFbclid" TEXT,
    "lastTtclid" TEXT,
    "lastMsclkid" TEXT,
    "lastLandingPage" TEXT,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PennyClick_contactId_idx" ON "PennyClick"("contactId");

-- CreateIndex
CREATE INDEX "PennyClick_firstSeen_idx" ON "PennyClick"("firstSeen");

-- CreateIndex
CREATE INDEX "Contact_pennyClickId_idx" ON "Contact"("pennyClickId");

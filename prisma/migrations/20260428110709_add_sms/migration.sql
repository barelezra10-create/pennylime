-- AlterTable
ALTER TABLE "TrackingConfig" ADD COLUMN "twilioAccountSid" TEXT;
ALTER TABLE "TrackingConfig" ADD COLUMN "twilioAuthToken" TEXT;
ALTER TABLE "TrackingConfig" ADD COLUMN "twilioFromNumber" TEXT;
ALTER TABLE "TrackingConfig" ADD COLUMN "twilioMessagingServiceSid" TEXT;

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "campaignId" TEXT,
    "twilioSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "priceUsd" DECIMAL,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "segmentRules" TEXT NOT NULL DEFAULT '[]',
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalDelivered" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "totalReplied" INTEGER NOT NULL DEFAULT 0,
    "totalOptOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "assignedRepId" TEXT,
    "source" TEXT,
    "pennyClickId" TEXT,
    "smsOptIn" BOOLEAN NOT NULL DEFAULT true,
    "smsOptOutAt" DATETIME,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    "landingPage" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "applicationId" TEXT,
    "lastAppStep" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contact" ("applicationId", "assignedRepId", "createdAt", "email", "fbclid", "firstName", "gbraid", "gclid", "id", "ipAddress", "landingPage", "lastAppStep", "lastName", "msclkid", "pennyClickId", "phone", "referrer", "source", "stage", "ttclid", "updatedAt", "userAgent", "utmCampaign", "utmContent", "utmMedium", "utmSource", "utmTerm", "wbraid") SELECT "applicationId", "assignedRepId", "createdAt", "email", "fbclid", "firstName", "gbraid", "gclid", "id", "ipAddress", "landingPage", "lastAppStep", "lastName", "msclkid", "pennyClickId", "phone", "referrer", "source", "stage", "ttclid", "updatedAt", "userAgent", "utmCampaign", "utmContent", "utmMedium", "utmSource", "utmTerm", "wbraid" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");
CREATE UNIQUE INDEX "Contact_applicationId_key" ON "Contact"("applicationId");
CREATE INDEX "Contact_stage_idx" ON "Contact"("stage");
CREATE INDEX "Contact_assignedRepId_idx" ON "Contact"("assignedRepId");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");
CREATE INDEX "Contact_createdAt_idx" ON "Contact"("createdAt");
CREATE INDEX "Contact_pennyClickId_idx" ON "Contact"("pennyClickId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_twilioSid_key" ON "SmsMessage"("twilioSid");

-- CreateIndex
CREATE INDEX "SmsMessage_contactId_idx" ON "SmsMessage"("contactId");

-- CreateIndex
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

-- CreateIndex
CREATE INDEX "SmsMessage_twilioSid_idx" ON "SmsMessage"("twilioSid");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmsCampaign_status_idx" ON "SmsCampaign"("status");

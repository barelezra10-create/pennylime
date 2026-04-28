-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "fbclid" TEXT;
ALTER TABLE "Contact" ADD COLUMN "gbraid" TEXT;
ALTER TABLE "Contact" ADD COLUMN "gclid" TEXT;
ALTER TABLE "Contact" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Contact" ADD COLUMN "landingPage" TEXT;
ALTER TABLE "Contact" ADD COLUMN "msclkid" TEXT;
ALTER TABLE "Contact" ADD COLUMN "referrer" TEXT;
ALTER TABLE "Contact" ADD COLUMN "ttclid" TEXT;
ALTER TABLE "Contact" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Contact" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "Contact" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "Contact" ADD COLUMN "wbraid" TEXT;

-- CreateTable
CREATE TABLE "TrackingConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "googleAdsConversionId" TEXT,
    "googleAdsDeveloperToken" TEXT,
    "googleAdsCustomerId" TEXT,
    "googleAdsLoginCustomerId" TEXT,
    "googleAdsRefreshToken" TEXT,
    "googleAdsClientId" TEXT,
    "googleAdsClientSecret" TEXT,
    "ga4MeasurementId" TEXT,
    "ga4ApiSecret" TEXT,
    "metaPixelId" TEXT,
    "metaConversionsApiToken" TEXT,
    "metaTestEventCode" TEXT,
    "tiktokPixelId" TEXT,
    "tiktokAccessToken" TEXT,
    "tiktokTestEventCode" TEXT,
    "microsoftUetTagId" TEXT,
    "microsoftConversionsApiToken" TEXT,
    "eventMappings" TEXT NOT NULL DEFAULT '{}',
    "customHeadHtml" TEXT,
    "customBodyHtml" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "contactId" TEXT,
    "applicationId" TEXT,
    "clickIds" TEXT NOT NULL DEFAULT '{}',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "platforms" TEXT NOT NULL DEFAULT '{}',
    "value" DECIMAL,
    "currency" TEXT DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TrackingEvent_eventName_idx" ON "TrackingEvent"("eventName");

-- CreateIndex
CREATE INDEX "TrackingEvent_contactId_idx" ON "TrackingEvent"("contactId");

-- CreateIndex
CREATE INDEX "TrackingEvent_status_idx" ON "TrackingEvent"("status");

-- CreateIndex
CREATE INDEX "TrackingEvent_createdAt_idx" ON "TrackingEvent"("createdAt");

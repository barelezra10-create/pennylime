-- AlterTable: add Twilio voice config fields to TrackingConfig
ALTER TABLE "TrackingConfig" ADD COLUMN     "twilioTwimlAppSid" TEXT,
ADD COLUMN     "twilioApiKeySid" TEXT,
ADD COLUMN     "twilioApiKeySecret" TEXT;

-- CreateTable: CallLog
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'call',
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "durationSec" INTEGER,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "transcription" TEXT,
    "outcome" TEXT,
    "notes" TEXT,
    "agentEmail" TEXT,
    "heardAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_twilioCallSid_key" ON "CallLog"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallLog_contactId_idx" ON "CallLog"("contactId");

-- CreateIndex
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

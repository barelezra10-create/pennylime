-- CreateTable
CREATE TABLE "SmsSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL DEFAULT '[]',
    "triggerType" TEXT NOT NULL,
    "triggerValue" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextSendAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsSequenceEnrollment_contactId_sequenceId_key" ON "SmsSequenceEnrollment"("contactId", "sequenceId");

-- CreateIndex
CREATE INDEX "SmsSequenceEnrollment_status_idx" ON "SmsSequenceEnrollment"("status");

-- CreateIndex
CREATE INDEX "SmsSequenceEnrollment_nextSendAt_idx" ON "SmsSequenceEnrollment"("nextSendAt");

BEGIN;
ALTER TABLE "Payment" ADD COLUMN "settlementId" TEXT, ADD COLUMN "supersededBySettlementId" TEXT;
CREATE TABLE "CollectionCase" (
 "applicationId" TEXT PRIMARY KEY, "ownerEmail" TEXT, "followUpAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CollectionCase_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CollectionCase_ownerEmail_followUpAt_idx" ON "CollectionCase"("ownerEmail", "followUpAt");
CREATE TABLE "SettlementAgreement" (
 "id" TEXT PRIMARY KEY, "applicationId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "total" DECIMAL(65,30) NOT NULL,
 "installmentCount" INTEGER NOT NULL, "frequency" TEXT NOT NULL, "firstPaymentDate" TIMESTAMP(3) NOT NULL,
 "scheduleJson" TEXT NOT NULL, "previousScheduleJson" TEXT NOT NULL, "originalBalance" DECIMAL(65,30) NOT NULL,
 "agreementText" TEXT NOT NULL, "authorizationText" TEXT NOT NULL, "agreementHash" TEXT NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 "sentAt" TIMESTAMP(3), "sendStartedAt" TIMESTAMP(3), "signedAt" TIMESTAMP(3), "signedName" TEXT,
 "signedIp" TEXT, "signedUserAgent" TEXT, "canceledAt" TIMESTAMP(3),
 CONSTRAINT "SettlementAgreement_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SettlementAgreement_applicationId_createdAt_idx" ON "SettlementAgreement"("applicationId", "createdAt");
CREATE INDEX "SettlementAgreement_status_idx" ON "SettlementAgreement"("status");
CREATE UNIQUE INDEX "SettlementAgreement_one_pending_per_application" ON "SettlementAgreement"("applicationId") WHERE "status" IN ('DRAFT', 'SENT');
COMMIT;

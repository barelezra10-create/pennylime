CREATE TABLE "AchAuthorization" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contactId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "bankAccountMask" TEXT,
    "bankName" TEXT,
    "scheduleJson" TEXT NOT NULL,
    "totalDebitAmount" DECIMAL(65,30) NOT NULL,
    "authorizationText" TEXT NOT NULL,
    "agreementHash" TEXT,
    "agreementVersion" TEXT DEFAULT 'v1-2026-05-17',

    CONSTRAINT "AchAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AchAuthorization_applicationId_idx" ON "AchAuthorization"("applicationId");
CREATE INDEX "AchAuthorization_contactId_idx" ON "AchAuthorization"("contactId");

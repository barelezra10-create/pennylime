ALTER TABLE "AdminUser" ADD COLUMN "mfaVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mfaEnrollmentHash" TEXT, ADD COLUMN "mfaEnrollmentExpiresAt" TIMESTAMP(3);
CREATE TABLE "AdminPasskey" (
 "id" TEXT PRIMARY KEY, "adminId" TEXT NOT NULL REFERENCES "AdminUser"("id") ON DELETE CASCADE,
 "publicKey" BYTEA NOT NULL, "counter" BIGINT NOT NULL DEFAULT 0, "transports" TEXT[] NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3)
);
CREATE INDEX "AdminPasskey_adminId_idx" ON "AdminPasskey"("adminId");
CREATE TABLE "AdminMfaChallenge" (
 "id" TEXT PRIMARY KEY, "adminId" TEXT NOT NULL REFERENCES "AdminUser"("id") ON DELETE CASCADE,
 "challenge" TEXT NOT NULL, "purpose" TEXT NOT NULL, "enrollmentHash" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminMfaChallenge_expiresAt_idx" ON "AdminMfaChallenge"("expiresAt");
CREATE TABLE "SecurityReview" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "summary" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SecurityReview_kind_createdAt_idx" ON "SecurityReview"("kind", "createdAt");
CREATE TABLE "RetentionCase" (
 "id" TEXT PRIMARY KEY, "applicationId" TEXT NOT NULL UNIQUE,
 "relationshipEndedAt" TIMESTAMP(3), "legalHold" BOOLEAN NOT NULL DEFAULT FALSE, "holdReason" TEXT,
 "reviewedBy" TEXT NOT NULL, "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "plaidRevokedAt" TIMESTAMP(3), "recordReviewDueAt" TIMESTAMP(3)
);
CREATE INDEX "RetentionCase_relationshipEndedAt_idx" ON "RetentionCase"("relationshipEndedAt");

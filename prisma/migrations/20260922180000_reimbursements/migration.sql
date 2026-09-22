CREATE TABLE "Reimbursement" (
 "id" TEXT PRIMARY KEY, "applicationId" TEXT NOT NULL, "customerName" TEXT NOT NULL, "applicationCode" TEXT NOT NULL,
 "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0 AND "amountCents" <= 100000), "bankAccountUuid" TEXT NOT NULL,
 "agreementText" TEXT NOT NULL, "agreementHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sentAt" TIMESTAMP(3), "sendStartedAt" TIMESTAMP(3), "signedAt" TIMESTAMP(3), "signedName" TEXT, "submittedAt" TIMESTAMP(3), "creditUuid" TEXT UNIQUE, "creditStatus" TEXT,
 "duplicateCents" INTEGER NOT NULL DEFAULT 0, "lastCheckedAt" TIMESTAMP(3), "lastError" TEXT
);
CREATE INDEX "Reimbursement_applicationId_idx" ON "Reimbursement"("applicationId");
CREATE TABLE "ReimbursementItem" (
 "id" TEXT PRIMARY KEY, "reimbursementId" TEXT NOT NULL REFERENCES "Reimbursement"("id"), "paymentId" TEXT NOT NULL,
 "transferUuid" TEXT NOT NULL UNIQUE, "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0), "dueDate" TIMESTAMP(3) NOT NULL, "originalStatus" TEXT NOT NULL
);
CREATE INDEX "ReimbursementItem_reimbursementId_idx" ON "ReimbursementItem"("reimbursementId");

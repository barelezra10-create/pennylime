-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "principal" DECIMAL NOT NULL,
    "interest" DECIMAL NOT NULL,
    "lateFee" DECIMAL NOT NULL DEFAULT 0,
    "dueDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentNumber" INTEGER NOT NULL,
    "achTransferId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "monthlyIncome" DECIMAL NOT NULL,
    "loanAmount" DECIMAL NOT NULL,
    "loanTermMonths" INTEGER NOT NULL,
    "interestRate" DECIMAL NOT NULL,
    "outcome" TEXT NOT NULL,
    "totalPaid" DECIMAL NOT NULL,
    "totalOwed" DECIMAL NOT NULL,
    "latePaymentCount" INTEGER NOT NULL DEFAULT 0,
    "defaultedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CollectionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "performedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "loanAmount" DECIMAL NOT NULL,
    "loanTermMonths" INTEGER NOT NULL DEFAULT 6,
    "platform" TEXT,
    "ssnEncrypted" TEXT,
    "ssnHash" TEXT,
    "plaidAccessToken" TEXT,
    "plaidAccountId" TEXT,
    "plaidItemId" TEXT,
    "plaidLinkStale" BOOLEAN NOT NULL DEFAULT false,
    "monthlyIncome" DECIMAL,
    "totalIncome" DECIMAL,
    "riskScore" DECIMAL,
    "interestRate" DECIMAL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "fundedAt" DATETIME,
    "fundedAmount" DECIMAL,
    "rejectionReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Application" ("applicationCode", "createdAt", "email", "firstName", "id", "lastName", "loanAmount", "phone", "rejectionReason", "status", "totalIncome", "updatedAt") SELECT "applicationCode", "createdAt", "email", "firstName", "id", "lastName", "loanAmount", "phone", "rejectionReason", "status", "totalIncome", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE UNIQUE INDEX "Application_applicationCode_key" ON "Application"("applicationCode");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE INDEX "Application_email_idx" ON "Application"("email");
CREATE INDEX "Application_ssnHash_idx" ON "Application"("ssnHash");
CREATE INDEX "Application_plaidItemId_idx" ON "Application"("plaidItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Payment_applicationId_idx" ON "Payment"("applicationId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_dueDate_idx" ON "Payment"("dueDate");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_performedBy_idx" ON "AuditLog"("performedBy");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RiskProfile_platform_idx" ON "RiskProfile"("platform");

-- CreateIndex
CREATE INDEX "RiskProfile_outcome_idx" ON "RiskProfile"("outcome");

-- CreateIndex
CREATE INDEX "CollectionEvent_applicationId_idx" ON "CollectionEvent"("applicationId");

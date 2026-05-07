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
    "bankBalance" DECIMAL,
    "riskModelId" TEXT,
    "interestRate" DECIMAL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "fundedAt" DATETIME,
    "fundedAmount" DECIMAL,
    "rejectionReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "increaseTransferId" TEXT,
    "increaseTransferStatus" TEXT,
    "increaseDisburseError" TEXT,
    "identityNeedsReview" BOOLEAN NOT NULL DEFAULT false,
    "plaidIdentityName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Application" ("applicationCode", "approvedAt", "approvedBy", "bankBalance", "createdAt", "email", "firstName", "fundedAmount", "fundedAt", "id", "increaseDisburseError", "increaseTransferId", "increaseTransferStatus", "interestRate", "lastName", "loanAmount", "loanTermMonths", "monthlyIncome", "phone", "plaidAccessToken", "plaidAccountId", "plaidItemId", "plaidLinkStale", "platform", "rejectionReason", "riskModelId", "riskScore", "ssnEncrypted", "ssnHash", "status", "totalIncome", "updatedAt") SELECT "applicationCode", "approvedAt", "approvedBy", "bankBalance", "createdAt", "email", "firstName", "fundedAmount", "fundedAt", "id", "increaseDisburseError", "increaseTransferId", "increaseTransferStatus", "interestRate", "lastName", "loanAmount", "loanTermMonths", "monthlyIncome", "phone", "plaidAccessToken", "plaidAccountId", "plaidItemId", "plaidLinkStale", "platform", "rejectionReason", "riskModelId", "riskScore", "ssnEncrypted", "ssnHash", "status", "totalIncome", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE UNIQUE INDEX "Application_applicationCode_key" ON "Application"("applicationCode");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE INDEX "Application_email_idx" ON "Application"("email");
CREATE INDEX "Application_ssnHash_idx" ON "Application"("ssnHash");
CREATE INDEX "Application_plaidItemId_idx" ON "Application"("plaidItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

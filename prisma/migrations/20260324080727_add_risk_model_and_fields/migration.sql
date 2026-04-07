/*
  Warnings:

  - Added the required column `ssnHash` to the `RiskProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Application" ADD COLUMN "bankBalance" DECIMAL;
ALTER TABLE "Application" ADD COLUMN "riskModelId" TEXT;

-- CreateTable
CREATE TABLE "RiskModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "coefficients" TEXT NOT NULL,
    "intercept" REAL NOT NULL,
    "features" TEXT NOT NULL,
    "trainingSize" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "precision" REAL NOT NULL,
    "recall" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RiskProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "ssnHash" TEXT NOT NULL,
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
INSERT INTO "new_RiskProfile" ("applicationId", "completedAt", "createdAt", "defaultedAt", "id", "interestRate", "latePaymentCount", "loanAmount", "loanTermMonths", "monthlyIncome", "outcome", "platform", "totalOwed", "totalPaid") SELECT "applicationId", "completedAt", "createdAt", "defaultedAt", "id", "interestRate", "latePaymentCount", "loanAmount", "loanTermMonths", "monthlyIncome", "outcome", "platform", "totalOwed", "totalPaid" FROM "RiskProfile";
DROP TABLE "RiskProfile";
ALTER TABLE "new_RiskProfile" RENAME TO "RiskProfile";
CREATE INDEX "RiskProfile_platform_idx" ON "RiskProfile"("platform");
CREATE INDEX "RiskProfile_outcome_idx" ON "RiskProfile"("outcome");
CREATE INDEX "RiskProfile_ssnHash_idx" ON "RiskProfile"("ssnHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

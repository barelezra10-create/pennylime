-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "availableBalance" DECIMAL(65,30),
ADD COLUMN     "avgWeeklyIncome" DECIMAL(65,30),
ADD COLUMN     "depositCadence" TEXT,
ADD COLUMN     "depositCount90d" INTEGER,
ADD COLUMN     "largestDeposit" DECIMAL(65,30),
ADD COLUMN     "lastPlaidRefresh" TIMESTAMP(3),
ADD COLUMN     "plaidAccountMask" TEXT,
ADD COLUMN     "plaidAccountName" TEXT,
ADD COLUMN     "plaidAccountSubtype" TEXT,
ADD COLUMN     "plaidIdentityAddress" TEXT,
ADD COLUMN     "plaidIdentityEmail" TEXT,
ADD COLUMN     "plaidIdentityPhone" TEXT,
ADD COLUMN     "plaidInstitutionName" TEXT;

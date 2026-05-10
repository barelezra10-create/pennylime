ALTER TABLE "Application"
  ADD COLUMN "bankName"                 TEXT,
  ADD COLUMN "bankRoutingNumberManual"  TEXT,
  ADD COLUMN "bankAccountNumberManual"  TEXT,
  ADD COLUMN "bankInfoMismatch"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refinedMonthlyIncome"     DECIMAL(65,30);

CREATE TABLE "TransactionClassification" (
  "id"               TEXT PRIMARY KEY,
  "applicationId"    TEXT NOT NULL,
  "counterpartyName" TEXT NOT NULL,
  "classification"   TEXT NOT NULL,
  "txCount"          INTEGER NOT NULL,
  "totalAmount"      DECIMAL(65,30) NOT NULL,
  "isInflow"         BOOLEAN NOT NULL DEFAULT true,
  "sampleTxId"       TEXT NOT NULL,
  "sampleTxDate"     TIMESTAMP(3) NOT NULL,
  "sampleTxAmount"   DECIMAL(65,30) NOT NULL,
  "classifiedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransactionClassification_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "TransactionClassification_applicationId_counterpartyName_key"
  ON "TransactionClassification"("applicationId","counterpartyName");
CREATE INDEX "TransactionClassification_applicationId_idx"
  ON "TransactionClassification"("applicationId");

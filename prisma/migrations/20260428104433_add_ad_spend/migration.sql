-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign" TEXT,
    "spend" DECIMAL NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AdSpend_date_idx" ON "AdSpend"("date");

-- CreateIndex
CREATE INDEX "AdSpend_platform_idx" ON "AdSpend"("platform");

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "pennyClickId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageView_pennyClickId_idx" ON "PageView"("pennyClickId");

-- CreateIndex
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_path_idx" ON "PageView"("path");

-- AddForeignKey
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_pennyClickId_fkey" FOREIGN KEY ("pennyClickId") REFERENCES "PennyClick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

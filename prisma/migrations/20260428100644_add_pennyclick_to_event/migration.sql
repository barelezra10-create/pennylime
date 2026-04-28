-- AlterTable
ALTER TABLE "TrackingEvent" ADD COLUMN "pennyClickId" TEXT;

-- CreateIndex
CREATE INDEX "TrackingEvent_pennyClickId_idx" ON "TrackingEvent"("pennyClickId");

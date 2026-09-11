ALTER TABLE "AdvanceTopUpRequest" ADD COLUMN "newApplicationId" TEXT, ADD COLUMN "weeklyRate" DECIMAL(65,30), ADD COLUMN "contractSendingAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "AdvanceTopUpRequest_newApplicationId_key" ON "AdvanceTopUpRequest"("newApplicationId");
ALTER TABLE "AdvanceTopUpRequest" ADD CONSTRAINT "AdvanceTopUpRequest_newApplicationId_fkey" FOREIGN KEY ("newApplicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

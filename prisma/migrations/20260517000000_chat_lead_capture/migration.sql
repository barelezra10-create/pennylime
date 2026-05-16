ALTER TABLE "AgentSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "AgentSession" ADD COLUMN "leadFirstName" TEXT;
ALTER TABLE "AgentSession" ADD COLUMN "leadLastName" TEXT;
ALTER TABLE "AgentSession" ADD COLUMN "leadEmail" TEXT;
ALTER TABLE "AgentSession" ADD COLUMN "lastPolledAt" TIMESTAMP(3);

CREATE INDEX "AgentSession_mode_startedAt_idx" ON "AgentSession"("mode", "startedAt");

ALTER TABLE "AgentMessage" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "AgentMessage" ADD COLUMN "emailedAt" TIMESTAMP(3);

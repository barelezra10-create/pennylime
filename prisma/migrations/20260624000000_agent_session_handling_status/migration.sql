-- Admin-controlled triage state for chat sessions.
ALTER TABLE "AgentSession" ADD COLUMN "handlingStatus" TEXT NOT NULL DEFAULT 'OPEN';
CREATE INDEX "AgentSession_handlingStatus_idx" ON "AgentSession"("handlingStatus");

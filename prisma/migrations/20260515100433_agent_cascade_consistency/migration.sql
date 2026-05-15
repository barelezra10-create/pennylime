-- DropForeignKey
ALTER TABLE "AgentSession" DROP CONSTRAINT "AgentSession_contactId_fkey";

-- DropForeignKey
ALTER TABLE "AgentVerification" DROP CONSTRAINT "AgentVerification_contactId_fkey";

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVerification" ADD CONSTRAINT "AgentVerification_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

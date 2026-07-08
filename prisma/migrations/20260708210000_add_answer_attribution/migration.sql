-- AddAnswerAttribution
ALTER TABLE "InboundEmail" ADD COLUMN "repliedBy" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "closedBy" TEXT;

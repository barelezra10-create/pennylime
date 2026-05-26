-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT,
    "subject" TEXT NOT NULL DEFAULT '(no subject)',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundEmail_status_idx" ON "InboundEmail"("status");

-- CreateIndex
CREATE INDEX "InboundEmail_receivedAt_idx" ON "InboundEmail"("receivedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_contactId_idx" ON "InboundEmail"("contactId");

-- CreateIndex
CREATE INDEX "InboundEmail_fromEmail_idx" ON "InboundEmail"("fromEmail");

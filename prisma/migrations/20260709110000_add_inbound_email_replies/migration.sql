-- CreateTable: InboundEmailReply
CREATE TABLE "InboundEmailReply" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailReply_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InboundEmailReply" ADD CONSTRAINT "InboundEmailReply_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "InboundEmailReply_emailId_createdAt_idx" ON "InboundEmailReply"("emailId", "createdAt");

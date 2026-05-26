-- Dedup inbound emails on messageId so provider retries don't double-insert.
-- Drop any existing duplicate rows first (keep the oldest by createdAt).
DELETE FROM "InboundEmail" a
USING "InboundEmail" b
WHERE a."messageId" IS NOT NULL
  AND a."messageId" = b."messageId"
  AND a."createdAt" > b."createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_messageId_key" ON "InboundEmail"("messageId");

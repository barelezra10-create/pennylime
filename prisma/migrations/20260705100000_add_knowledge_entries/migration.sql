-- CreateTable: KnowledgeEntry
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "timesSent" INTEGER NOT NULL DEFAULT 0,
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: KnowledgeWaiter
CREATE TABLE "KnowledgeWaiter" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeWaiter_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "KnowledgeWaiter" ADD CONSTRAINT "KnowledgeWaiter_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KnowledgeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "KnowledgeWaiter_entryId_sessionId_key" ON "KnowledgeWaiter"("entryId", "sessionId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_status_createdAt_idx" ON "KnowledgeEntry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeWaiter_sessionId_idx" ON "KnowledgeWaiter"("sessionId");

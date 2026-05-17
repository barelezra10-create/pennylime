CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "chatStartedEmails" TEXT NOT NULL DEFAULT '',
    "applicationSubmittedEmails" TEXT NOT NULL DEFAULT '',
    "leadCreatedEmails" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

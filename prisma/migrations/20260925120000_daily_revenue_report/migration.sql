ALTER TABLE "NotificationConfig"
  ADD COLUMN "dailyRevenueEmails" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dailyRevenueLastSentDate" TEXT;

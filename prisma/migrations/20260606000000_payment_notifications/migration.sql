-- Add per-payment notification recipient columns to the singleton
-- NotificationConfig row.
ALTER TABLE "NotificationConfig" ADD COLUMN "paymentSettledEmails" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NotificationConfig" ADD COLUMN "paymentFailedEmails" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NotificationConfig" ADD COLUMN "paymentInitiatedEmails" TEXT NOT NULL DEFAULT '';

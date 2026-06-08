-- Add increaseReturnReason column to Payment for ACH return
-- reason codes (R01 NSF, R02 closed, R03 no account, etc.).
ALTER TABLE "Payment" ADD COLUMN "increaseReturnReason" TEXT;

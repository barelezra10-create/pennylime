-- GoACH deposit/effective date of the disbursement (when the advance lands in
-- the borrower's account). The first repayment debit is held until after this.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "goachDepositDate" TIMESTAMP(3);

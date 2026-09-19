import {expect,it} from "vitest";
import {paymentProgress} from "./payment-progress";
const p={status:"PENDING",amount:100,lateFee:0,collectedAmount:0,dueDate:new Date("2026-09-21T12:00:00Z")};
it("shows partial collections and processing balances without counting superseded obligations twice",()=>{
 expect(paymentProgress([{...p,status:"PAID",collectedAmount:100},{...p,status:"CANCELED",collectedAmount:20,supersededBySettlementId:"s"},{...p,amount:80},{...p,status:"PROCESSING",amount:50}])).toMatchObject({collected:120,remaining:130,paidCount:1,processingCount:1,nextPaymentAmount:80});
});
it("handles an account with no payment schedule",()=>{expect(paymentProgress([])).toMatchObject({collected:0,remaining:0,nextPaymentDate:null});});

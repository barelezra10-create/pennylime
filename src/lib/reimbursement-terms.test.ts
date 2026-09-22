import {expect,it} from "vitest";
import {reimbursementTerms,duplicateReimbursementCents} from "./reimbursement-terms";
it("recovers only returned items after reimbursement credit is paid",()=>{
 const items=[{amountCents:5977,originalStatus:"Returned"},{amountCents:5977,originalStatus:"Processed"},{amountCents:5977,originalStatus:"NSF"}];
 expect(duplicateReimbursementCents("Processed",items)).toBe(0);expect(duplicateReimbursementCents("Funded",items)).toBe(11954);expect(duplicateReimbursementCents("Returned",items)).toBe(0);
});
it("includes exact source references and excludes fees or blanket debit authority",()=>{const text=reimbursementTerms("Serena Davis","TEST",[{transferUuid:"original-1",amountCents:5977,dueDate:"2026-09-17"}]);expect(text).toContain("$59.77");expect(text).toContain("GoACH original-1");expect(text).toContain("No additional fee, interest, or penalty");expect(text).toContain("does not authorize an automatic ACH debit");});

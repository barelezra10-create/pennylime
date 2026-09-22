import {expect,it} from "vitest";
import {accountWorkspace} from "./support-workspace";
it.each(["FUNDED","ACTIVE","REPAYING"])("keeps current %s clients in active",status=>{expect(accountWorkspace({status,overdue:0,settlementStatus:null})).toBe("active");});
it.each(["LATE","COLLECTIONS","DEFAULTED"])("keeps %s in collections even with no calculated overdue balance",status=>{expect(accountWorkspace({status,overdue:0,settlementStatus:null})).toBe("collections");});
it("routes an overdue active account to collections only",()=>{expect(accountWorkspace({status:"ACTIVE",overdue:1,settlementStatus:null})).toBe("collections");});
it.each(["DRAFT","SENT","ACTIVE"])("retains %s settlements in collections",settlementStatus=>{expect(accountWorkspace({status:"REPAYING",overdue:0,settlementStatus})).toBe("collections");});

it("keeps a manually restored client active despite overdue balances and a settlement",()=>{
 expect(accountWorkspace({status:"DEFAULTED",overdue:500,settlementStatus:"ACTIVE",workspaceOverride:"active"})).toBe("active");
});
it("uses automatic collections routing when the override is cleared",()=>{
 expect(accountWorkspace({status:"LATE",overdue:500,settlementStatus:null,workspaceOverride:null})).toBe("collections");
});

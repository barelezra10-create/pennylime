import {expect,it} from "vitest";
import {accountWorkspace} from "./support-workspace";
it.each(["FUNDED","ACTIVE","REPAYING"])("keeps current %s clients in active",status=>{expect(accountWorkspace({status,overdue:0,settlementStatus:null})).toBe("active");});
it.each(["LATE","COLLECTIONS","DEFAULTED"])("keeps %s in collections even with no calculated overdue balance",status=>{expect(accountWorkspace({status,overdue:0,settlementStatus:null})).toBe("collections");});
it("routes an overdue active account to collections only",()=>{expect(accountWorkspace({status:"ACTIVE",overdue:1,settlementStatus:null})).toBe("collections");});
it.each(["DRAFT","SENT","ACTIVE"])("retains %s settlements in collections",settlementStatus=>{expect(accountWorkspace({status:"REPAYING",overdue:0,settlementStatus})).toBe("collections");});

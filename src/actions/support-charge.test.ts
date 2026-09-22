import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),payment:vi.fn(),claim:vi.fn(),settlement:vi.fn()}));
vi.mock("next-auth",()=>({getServerSession:m.session}));
vi.mock("@/lib/auth",()=>({authOptions:{}}));
vi.mock("@/lib/auth-helpers",()=>({requireNonSupportRole:vi.fn()}));
vi.mock("@/lib/audit",()=>({logAudit:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{payment:{findUnique:m.payment,updateMany:m.claim},settlementAgreement:{findUnique:m.settlement}}}));
import {chargePartialPayment} from "./payments";
beforeEach(()=>{
 vi.clearAllMocks();m.session.mockResolvedValue({user:{email:"support@example.com",role:"SUPPORT"}});
 m.payment.mockResolvedValue({id:"p1",applicationId:"a1",application:{id:"a1"},status:"LATE",amount:100,collectedAmount:0,lateFee:0,settlementId:null,supersededBySettlementId:null});
 m.claim.mockResolvedValue({count:0});
});
it("permits support through authorization but blocks a concurrent debit",async()=>{
 const r=await chargePartialPayment("p1",20);expect(m.claim).toHaveBeenCalled();expect(r).toMatchObject({success:false,error:expect.stringContaining("already processing")});
});
it("rejects unauthenticated charges",async()=>{m.session.mockResolvedValue(null);expect(await chargePartialPayment("p1",20)).toMatchObject({success:false,error:"Not authenticated"});expect(m.payment).not.toHaveBeenCalled();});
it.each([0,-1,101,NaN,Infinity,1.001])("rejects invalid or excessive amount %s",async(amount)=>{expect(await chargePartialPayment("p1",amount)).toMatchObject({success:false});expect(m.claim).not.toHaveBeenCalled();});
it("does not charge processing payments",async()=>{const p=await m.payment();m.payment.mockResolvedValue({...p,status:"PROCESSING"});expect(await chargePartialPayment("p1",20)).toMatchObject({success:false});expect(m.claim).not.toHaveBeenCalled();});
it("does not charge an unsigned settlement",async()=>{const p=await m.payment();m.payment.mockResolvedValue({...p,settlementId:"s1"});m.settlement.mockResolvedValue({status:"SENT"});expect(await chargePartialPayment("p1",20)).toMatchObject({success:false});expect(m.claim).not.toHaveBeenCalled();});

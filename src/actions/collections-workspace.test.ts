import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), app: vi.fn(), contact: vi.fn(), rule: vi.fn(), transaction: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction,
 application: { findUnique: m.app }, contact: { findFirst: m.contact }, loanRule: { findFirst: m.rule },
} }));
vi.mock("@/lib/collection-history", () => ({ collectionCommunications: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/collections-ladder", () => ({ buildCollectionsTimeline: () => ({ upcoming: [] }) }));
import { getCollectionAccount, moveCollectionToActive } from "./collections-workspace";
beforeEach(() => {
 vi.clearAllMocks();
 m.session.mockResolvedValue({user:{email:"support@example.com",role:"SUPPORT"}});
 m.rule.mockResolvedValue(null);
 m.contact.mockResolvedValue({id:"c1",email:"client@example.com",phone:"2025550147",smsOptIn:false,tags:[],createdAt:new Date("2026-09-01")});
 m.app.mockResolvedValue({
  id:"a1",applicationCode:"PL-TEST",firstName:"Test",lastName:"Client",email:"client@example.com",phone:"2025550147",status:"ACTIVE",
  addressStreet:"123 Example St",addressCity:"Richmond",addressState:"VA",addressZip:"23220",contact:null,
  monthlyIncome:0,refinedMonthlyIncome:null,avgWeeklyIncome:null,loanAmount:500,loanTermMonths:1,paymentFrequency:"WEEKLY",fundedAmount:null,
  createdAt:new Date("2026-09-02"),bankBalance:null,documents:[{id:"doc1",fileName:"signed.pdf",documentType:"SIGNED_AGREEMENT_PDF",createdAt:new Date("2026-09-02"),storagePath:"/app/uploads/signed.pdf",fileSize:1024,mimeType:"application/pdf"}],payments:[],collectionEvents:[],settlements:[],plaidAccountMask:"12345678",
 });
});
it("returns the support profile and falls back to the matching CRM contact",async()=>{
 const d=await getCollectionAccount("a1");
 expect(d.profile.address).toBe("123 Example St\nRichmond, VA, 23220");
 expect(d.profile.smsOptIn).toBe(false);
 expect(d.profile.monthlyIncome).toBe(0);
 expect(d.profile.refinedMonthlyIncome).toBeNull();
 expect(d.profile.bankAccountLastFour).toBe("5678");
 expect(d.profile.documents[0]).toMatchObject({ id: "doc1", name: "signed.pdf", type: "SIGNED_AGREEMENT_PDF", url: "/api/files/%2Fapp%2Fuploads%2Fsigned.pdf" });
 expect(d.profile.documents[0]).not.toHaveProperty("storagePath");
 const select=m.app.mock.calls[0][0].select;
 for(const field of ["ssnEncrypted","ssnHash","plaidAccessToken","bankAccountNumberManual","bankRoutingNumberManual","offerToken"]) expect(select).not.toHaveProperty(field);
});
it("handles absent address and CRM details",async()=>{
 const a=await m.app();m.app.mockResolvedValue({...a,addressStreet:null,addressCity:null,addressState:null,addressZip:null});m.contact.mockResolvedValue(null);
 const d=await getCollectionAccount("a1");expect(d.profile.address).toBeNull();expect(d.profile.smsOptIn).toBeNull();expect(d.profile.tags).toEqual([]);
});
it("does not expose profiles to unauthenticated requests",async()=>{
 m.session.mockResolvedValue(null);await expect(getCollectionAccount("a1")).rejects.toThrow("Not authenticated");expect(m.app).not.toHaveBeenCalled();
});

it("moves an authenticated support account without changing payments or financial status",async()=>{
 const tx={application:{findUnique:vi.fn().mockResolvedValue({status:"DEFAULTED"})},collectionCase:{upsert:vi.fn()},collectionEvent:{create:vi.fn()},auditLog:{create:vi.fn()}};
 m.transaction.mockImplementation(fn=>fn(tx));
 expect(await moveCollectionToActive("a1")).toEqual({ok:true});
 expect(tx.collectionCase.upsert).toHaveBeenCalledWith({where:{applicationId:"a1"},create:{applicationId:"a1",workspaceOverride:"active"},update:{workspaceOverride:"active"}});
 expect(tx.collectionEvent.create).toHaveBeenCalled();expect(tx.auditLog.create).toHaveBeenCalled();
});
it("rejects moving a closed account",async()=>{
 const upsert=vi.fn();m.transaction.mockImplementation(fn=>fn({application:{findUnique:vi.fn().mockResolvedValue({status:"PAID_OFF"})},collectionCase:{upsert}}));
 await expect(moveCollectionToActive("a1")).rejects.toThrow("no longer available");expect(upsert).not.toHaveBeenCalled();
});
it("requires authentication before moving an account",async()=>{
 m.session.mockResolvedValue(null);await expect(moveCollectionToActive("a1")).rejects.toThrow("Not authenticated");expect(m.transaction).not.toHaveBeenCalled();
});

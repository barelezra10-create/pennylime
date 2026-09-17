import {beforeEach,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>Object.fromEntries(["callLog","smsMessage","inboundEmail","agentSession","activity","emailEvent","supportTicket"].map(k=>[k,{findMany:vi.fn()}])));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({prisma:db}));
import {collectionCommunications} from "./collection-history";
beforeEach(()=>{for(const model of Object.values(db)) model.findMany.mockReset().mockResolvedValue([]);});
it("limits phone fallback to unlinked records and includes both call directions",async()=>{
 await collectionCommunications({contactId:"contact-A",email:"client@example.com",phone:"(312) 555-6789"});
 const where=db.callLog.findMany.mock.calls[0][0].where;
 expect(where.OR[0]).toEqual({contactId:"contact-A"});
 expect(where.OR[1].contactId).toBeNull();
 expect(where.OR[1].OR[0].fromNumber.in).toContain("+13125556789");
 expect(where.OR[1].OR[1].toNumber.in).toContain("3125556789");
 expect(db.inboundEmail.findMany.mock.calls[0][0].where.OR[1]).toEqual({contactId:null,fromEmail:{equals:"client@example.com",mode:"insensitive"}});
});
it("does not query all contacts when account has no contact or phone",async()=>{
 await collectionCommunications({contactId:null,email:"client@example.com",phone:null});
 expect(db.callLog.findMany.mock.calls[0][0].where).toEqual({OR:[]});
 expect(db.activity.findMany).not.toHaveBeenCalled();
 expect(db.emailEvent.findMany).not.toHaveBeenCalled();
});
it("retains messages, replies and delivery events in newest-first order",async()=>{
 const old=new Date("2026-09-01T12:00:00Z"),recent=new Date("2026-09-02T12:00:00Z");
 db.inboundEmail.findMany.mockResolvedValue([{id:"e1",subject:"Payment help",bodyText:"Cannot pay",fromEmail:"client@example.com",receivedAt:old,replies:[{id:"r1",body:"We can discuss options",sentBy:"agent",createdAt:recent}]}]);
 db.emailEvent.findMany.mockResolvedValue([{id:"e2",subject:"Reminder",type:"delivered",createdAt:old}]);
 const rows=await collectionCommunications({contactId:"contact-A",email:"client@example.com",phone:null});
 expect(rows).toHaveLength(3);
 expect(rows[0]).toMatchObject({id:"reply:r1",body:"We can discuss options",by:"agent"});
 expect(rows.find(r=>r.id==="email:e1")?.body).toBe("Cannot pay");
 expect(db.agentSession.findMany.mock.calls[0][0].select.messages.where.role.in).toEqual(["user","assistant"]);
});

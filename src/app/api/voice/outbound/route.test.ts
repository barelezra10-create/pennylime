import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({verify:vi.fn(),upsert:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{callLog:{upsert:mocks.upsert}}}));
vi.mock("@/lib/tracking/config",()=>({getTrackingConfig:async()=>({twilioFromNumber:"+13865551234"})}));
vi.mock("@/lib/voice/signature",()=>({readVerifiedTwilioForm:mocks.verify}));
vi.mock("@/lib/voice/numbers",()=>({listOwnedVoiceNumbers:async()=>[{number:"+13092456054",label:"Illinois"},{number:"+13865551234",label:"Florida"}]}));
import {POST} from "./route";
beforeEach(()=>vi.clearAllMocks());
it.each([[undefined,"+13092456054"],["auto","+13092456054"],["manual","+13865551234"]])("enforces %s selection in TwiML and call history",async(mode,expected)=>{
  mocks.verify.mockResolvedValue({ok:true,params:{To:"+13125556789",CallSid:"CA123",From:"client:agent",callerId:"+13865551234",callerIdMode:mode}});
  const response=await POST(new NextRequest("https://pennylime.com/api/voice/outbound",{method:"POST"}));
  expect(await response.text()).toContain(`callerId="${expected}"`);
  expect(mocks.upsert.mock.calls[0][0].create.fromNumber).toBe(expected);
});
it("rejects an unverified webhook before creating a call",async()=>{
  mocks.verify.mockResolvedValue({ok:false,response:new Response("Forbidden",{status:403})});
  expect((await POST(new NextRequest("https://pennylime.com/api/voice/outbound",{method:"POST"}))).status).toBe(403);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

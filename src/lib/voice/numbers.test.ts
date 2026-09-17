import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tracking/config", () => ({ getTrackingConfig: async () => ({twilioAccountSid:"ACtest",twilioAuthToken:"test"}) }));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
it("loads voice numbers across all pages and caches the complete result", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({incoming_phone_numbers:[{phone_number:"+13092456054",capabilities:{voice:true}},{phone_number:"+12125551234",capabilities:{voice:false}}],next_page_uri:"/2010-04-01/Accounts/ACtest/IncomingPhoneNumbers.json?Page=1"})}).mockResolvedValueOnce({ok:true,json:async()=>({incoming_phone_numbers:[{phone_number:"+13865551234",capabilities:{voice:true}}]})});
  vi.stubGlobal("fetch",fetcher);
  const {listOwnedVoiceNumbers} = await import("./numbers");
  expect((await listOwnedVoiceNumbers()).map(n=>n.number)).toEqual(["+13092456054","+13865551234"]);
  await listOwnedVoiceNumbers();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("never forwards account credentials to an external pagination URL", async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({next_page_uri:"https://example.com/steal"})});
  vi.stubGlobal("fetch",fetcher);
  const {listOwnedVoiceNumbers}=await import("./numbers");
  expect(await listOwnedVoiceNumbers()).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

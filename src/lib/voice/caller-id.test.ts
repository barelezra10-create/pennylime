import { describe, expect, it } from "vitest";
import { selectCallerId, usAreaCode } from "./caller-id";
const il = "+13092456054", fl = "+13865551234", chicago = "+13125551234";
const numbers = [fl, il].map(number => ({ number, label: number }));
const choose = (to: string, manualNumber?: string) => selectCallerId({ to, numbers, defaultNumber: fl, manualNumber });
describe("state caller ID matching", () => {
  it.each(["312", "773", "872"])("matches Chicago %s to owned Illinois number", code => {
    expect(choose(`+1${code}5556789`)).toEqual({ number: il, state: "IL", reason: "state" });
  });
  it("prefers an exact area code over another number in the state", () => {
    expect(selectCallerId({ to: "3125556789", numbers: [...numbers, {number: chicago,label:"Chicago"}], defaultNumber: fl }).number).toBe(chicago);
  });
  it("recalculates for each destination", () => {
    expect(choose("3125556789").number).toBe(il);
    expect(choose("3055556789").number).toBe(fl);
  });
  it("allows only owned manual overrides", () => {
    expect(choose("3125556789", fl).reason).toBe("manual");
    expect(choose("3125556789", "+12125551234").number).toBe(il);
  });
  it.each(["+442079460123", "+18005551234", "+14165551234", "bad", "2125556789"])("falls back safely for %s", to => {
    expect(choose(to).number).toBe(fl);
  });
  it("never returns an unowned default", () => {
    expect(selectCallerId({to:"2125556789",numbers,defaultNumber:"+12125551234"}).number).toBe(il);
    expect(selectCallerId({to:"3125556789",numbers:[],defaultNumber:il}).number).toBeNull();
  });
  it("handles US formatting and rejects explicitly international numbers", () => {
    expect(usAreaCode("(312) 555-6789")).toBe("312");
    expect(usAreaCode("1-312-555-6789")).toBe("312");
    expect(usAreaCode("+31 25556789")).toBeNull();
  });
});

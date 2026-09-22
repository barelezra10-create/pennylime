import { describe, expect, it } from "vitest";
import { isMissedInbound } from "./call-history";

describe("missed incoming calls", () => {
  it("includes voicemail even when the recording completed", () => {
    expect(isMissedInbound({ direction: "inbound", kind: "voicemail", status: "completed" })).toBe(true);
  });
  it.each(["no-answer", "busy", "failed", "canceled"])("includes %s incoming calls", status => {
    expect(isMissedInbound({ direction: "inbound", kind: "support", status })).toBe(true);
  });
  it("excludes answered and still ringing incoming calls", () => {
    for (const status of ["completed", "in-progress", "ringing"]) expect(isMissedInbound({ direction: "inbound", kind: "support", status })).toBe(false);
  });
  it("excludes unsuccessful outgoing calls", () => {
    expect(isMissedInbound({ direction: "outbound", kind: "support", status: "no-answer" })).toBe(false);
  });
});

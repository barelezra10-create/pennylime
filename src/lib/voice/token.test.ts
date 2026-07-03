import { describe, it, expect } from "vitest";
import { mintVoiceToken } from "./token";

function decodePayload(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf-8"));
}

describe("mintVoiceToken", () => {
  it("mints a JWT with a voice grant for the TwiML app", () => {
    const jwt = mintVoiceToken({
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      apiKeySid: "SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      apiKeySecret: "secret123",
      twimlAppSid: "APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      identity: "bar@albert-capital.com",
    });
    const payload = decodePayload(jwt);
    expect(payload.grants.identity).toBe("bar@albert-capital.com");
    expect(payload.grants.voice.outgoing.application_sid).toBe("APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(payload.grants.voice.incoming).toBeUndefined();
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(3600);
  });
});

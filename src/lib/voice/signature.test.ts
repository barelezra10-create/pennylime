import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tracking/config", () => ({
  getTrackingConfig: vi.fn(),
}));

import { validateTwilioSignature } from "./signature";

function sign(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("validateTwilioSignature", () => {
  const authToken = "test_auth_token_123";
  const url = "https://pennylime.com/api/voice/outbound";
  const params = { CallSid: "CA123", To: "+15551234567", From: "client:bar" };

  it("accepts a correctly signed request", () => {
    const signature = sign(authToken, url, params);
    expect(validateTwilioSignature({ authToken, url, params, signature })).toBe(true);
  });

  it("rejects a tampered param", () => {
    const signature = sign(authToken, url, params);
    expect(
      validateTwilioSignature({ authToken, url, params: { ...params, To: "+19999999999" }, signature })
    ).toBe(false);
  });

  it("rejects a wrong-length or empty signature without throwing", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: "short" })).toBe(false);
    expect(validateTwilioSignature({ authToken, url, params, signature: "" })).toBe(false);
  });
});

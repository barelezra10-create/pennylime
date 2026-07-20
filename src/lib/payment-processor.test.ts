import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tracking/config", () => ({ getTrackingConfig: async () => ({ paymentProcessor: "increase" }) }));
import { goachProductionReady, getPaymentProcessor } from "./payment-processor";

describe("goachProductionReady", () => {
  const OLD = { ...process.env };
  beforeEach(() => { process.env = { ...OLD }; });
  it("false when unconfigured", () => {
    delete process.env.GOACH_API_KEY;
    expect(goachProductionReady()).toBe(false);
  });
  it("false when configured but base url is staging", () => {
    process.env.GOACH_API_KEY = "k"; process.env.GOACH_ORIGINATOR_UUID = "o"; process.env.GOACH_BASE_URL = "https://staging.goach.com/api/v1";
    expect(goachProductionReady()).toBe(false);
  });
  it("true only when configured AND base url is production", () => {
    process.env.GOACH_API_KEY = "k"; process.env.GOACH_ORIGINATOR_UUID = "o"; process.env.GOACH_BASE_URL = "https://login.goach.com/api/v1";
    expect(goachProductionReady()).toBe(true);
  });
});

describe("getPaymentProcessor", () => {
  it("is always goach now", async () => {
    expect(await getPaymentProcessor()).toBe("goach");
  });
});

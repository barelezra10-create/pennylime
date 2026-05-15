import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: vi.fn() }));

import { listToolsForAuth, getTool } from "./index";

describe("tool registry", () => {
  it("anon sees only anon-required tools", () => {
    const names = listToolsForAuth("anon").map((t) => t.name);
    expect(names).toContain("getLoanProducts");
    expect(names).toContain("getStateRules");
    expect(names).toContain("verifyIdentity");
    expect(names).not.toContain("getLoanSummary");
    expect(names).not.toContain("schedulePayment");
  });
  it("phone-matched sees anon + phone-matched tools", () => {
    const names = listToolsForAuth("phone-matched").map((t) => t.name);
    expect(names).toContain("getApplicationStatus");
    expect(names).not.toContain("schedulePayment");
  });
  it("verified sees everything", () => {
    const names = listToolsForAuth("verified").map((t) => t.name);
    expect(names).toContain("schedulePayment");
    expect(names).toContain("changeDueDate");
    expect(names).toContain("getLoanSummary");
  });
  it("getTool returns by name", () => {
    expect(getTool("getLoanProducts")?.name).toBe("getLoanProducts");
    expect(getTool("nope")).toBeUndefined();
  });
});

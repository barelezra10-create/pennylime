import { describe, it, expect } from "vitest";
import { getStateRules } from "./getStateRules";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "anon", metadata: {} } as const;

describe("getStateRules", () => {
  it("returns APR cap for a supported state", async () => {
    const res = await getStateRules.handler({ state: "FL" }, ctx);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const d = res.data as { state: string; supported: boolean; aprCap?: number };
    expect(d.state).toBe("FL");
    expect(d.supported).toBe(true);
    expect(typeof d.aprCap).toBe("number");
  });
  it("marks unsupported state", async () => {
    const res = await getStateRules.handler({ state: "ZZ" }, ctx);
    if (res.status !== "ok") return;
    const d = res.data as { supported: boolean };
    expect(d.supported).toBe(false);
  });
});

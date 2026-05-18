import { describe, it, expect } from "vitest";
import { getLoanProducts } from "./getLoanProducts";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "anon", metadata: {} } as const;

describe("getLoanProducts", () => {
  it("returns product info for any caller", async () => {
    const res = await getLoanProducts.handler({}, ctx);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const data = res.data as { minAmount: number; maxAmount: number; eligibility: string[] };
    expect(data.minAmount).toBe(500);
    expect(data.maxAmount).toBe(10000);
    expect(data.eligibility).toContain("Uber");
  });
});

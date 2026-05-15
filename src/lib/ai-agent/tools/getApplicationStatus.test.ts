import { describe, it, expect, vi, beforeEach } from "vitest";

const findApp = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { findUnique: (...a: unknown[]) => findApp(...a) } },
}));

import { getApplicationStatus } from "./getApplicationStatus";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "phone-matched", contactId: "c1", metadata: {} } as const;

beforeEach(() => findApp.mockReset());

describe("getApplicationStatus", () => {
  it("returns stage + next step for an existing application", async () => {
    findApp.mockResolvedValue({
      id: "a1",
      applicationCode: "ABC123",
      status: "APPROVED",
      offerStatus: "PENDING",
      acceptedAmount: null,
    });
    const res = await getApplicationStatus.handler({ applicationCode: "ABC123" }, ctx);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const d = res.data as { stage: string; nextStep: string };
    expect(d.stage).toBe("APPROVED");
    expect(d.nextStep).toMatch(/accept your offer/i);
  });
  it("returns not_found for unknown code", async () => {
    findApp.mockResolvedValue(null);
    const res = await getApplicationStatus.handler({ applicationCode: "NOPE" }, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { found: boolean }).found).toBe(false);
  });
});

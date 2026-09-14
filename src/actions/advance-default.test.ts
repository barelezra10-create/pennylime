import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), event: vi.fn(), audit: vi.fn(), app: vi.fn(), risk: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireNonSupportRole: m.auth }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
  application: { updateMany: m.update, findUniqueOrThrow: m.app },
  collectionEvent: { create: m.event }, auditLog: { create: m.audit }, riskProfile: { create: m.risk },
}) } }));
import { markAdvanceDefault } from "./advance-default";
describe("manual Default", () => {
  beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ ok: true, email: "staff@example.com" }); });
  it("rejects unauthorized staff without changing an account", async () => {
    m.auth.mockResolvedValue({ ok: false, error: "Not permitted" });
    expect((await markAdvanceDefault("a")).success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects stale or non-active accounts without recording a default", async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect((await markAdvanceDefault("a")).success).toBe(false);
    expect(m.event).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({ where: { id: "a", status: { in: ["FUNDED", "ACTIVE", "REPAYING", "LATE"] } }, data: { status: "DEFAULTED" } });
  });
  it("moves an active account and attributes the change to staff", async () => {
    m.update.mockResolvedValue({ count: 1 }); m.app.mockResolvedValue({ ssnHash: null });
    expect((await markAdvanceDefault("a")).success).toBe(true);
    expect(m.event).toHaveBeenCalledWith({ data: expect.objectContaining({ applicationId: "a", eventType: "DEFAULTED", performedBy: "staff@example.com" }) });
    expect(m.audit).toHaveBeenCalled(); expect(m.refresh).toHaveBeenCalled();
  });
});

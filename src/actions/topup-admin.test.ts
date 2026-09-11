import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(), audit: vi.fn(), requestGet: vi.fn(), requestUpdate: vi.fn(), appGet: vi.fn(), appCreate: vi.fn(), appUpdate: vi.fn(), lock: vi.fn(), send: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/actions/offers", () => ({ resendOfferNotification: mocks.send }));
vi.mock("@/lib/db", () => {
  const tx = { $queryRaw: mocks.lock, advanceTopUpRequest: { findUnique: mocks.requestGet, update: mocks.requestUpdate }, application: { findUnique: mocks.appGet, create: mocks.appCreate, update: mocks.appUpdate } };
  return { prisma: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});
import { prepareTopUpOffer, sendTopUpContract } from "./topup-admin";
const input = { requestId: "request", amount: 1400, weeklyRate: 6, durationWeeks: 16 };
const parent = { id: "parent", firstName: "Test", lastName: "Borrower", email: "test@example.com", phone: "", offerStatus: "ACCEPTED", fundedAt: new Date(), goachDisburseUuid: "old-transfer" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.requestGet.mockResolvedValue({ id: "request", applicationId: "parent", status: "PENDING", requestedAmount: 1400, newApplicationId: null });
  mocks.appGet.mockResolvedValue(parent);
  mocks.appCreate.mockResolvedValue({ id: "child" });
  mocks.appUpdate.mockResolvedValue({ id: "child" });
  mocks.send.mockResolvedValue({ ok: true });
});
describe("top-up preparation", () => {
  it("creates a separate fixed-amount offer without altering or funding the parent", async () => {
    expect(await prepareTopUpOffer(input)).toEqual({ ok: true });
    const data = mocks.appCreate.mock.calls[0][0].data;
    expect(data.offeredMinAmount).toBe(1400);
    expect(data.offeredMaxAmount).toBe(1400);
    expect(data.offerStatus).toBe("OFFERED");
    expect(data.goachDisburseUuid).toBeUndefined();
    expect(data.fundedAt).toBeUndefined();
    expect(mocks.appUpdate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ newApplicationId: "child" }) }));
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.appCreate.mock.invocationCallOrder[0]);
  });
  it("reuses the child for repeated draft saves", async () => {
    mocks.requestGet.mockResolvedValue({ id: "request", applicationId: "parent", status: "APPROVED", requestedAmount: 1400, newApplicationId: "child" });
    mocks.appGet.mockResolvedValueOnce({ id: "child", offerStatus: "OFFERED" }).mockResolvedValueOnce(parent);
    expect((await prepareTopUpOffer(input)).ok).toBe(true);
    expect(mocks.appCreate).not.toHaveBeenCalled();
    expect(mocks.appUpdate.mock.calls[0][0].where.id).toBe("child");
  });
  it.each([{ offerSentAt: new Date() }, { offerStatus: "ACCEPTED" }, { fundedAt: new Date() }])("locks dispatched, signed or funded contracts %j", async state => {
    mocks.requestGet.mockResolvedValue({ id: "request", applicationId: "parent", status: "APPROVED", requestedAmount: 1400, newApplicationId: "child" });
    mocks.appGet.mockResolvedValue({ id: "child", ...state });
    expect((await prepareTopUpOffer(input)).ok).toBe(false);
    expect(mocks.appUpdate).not.toHaveBeenCalled();
  });
  it("rejects an unauthenticated admin", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await prepareTopUpOffer(input)).ok).toBe(false);
    expect(mocks.appCreate).not.toHaveBeenCalled();
  });
  it("blocks edits while a contract is being sent", async () => {
    mocks.requestGet.mockResolvedValue({ status: "APPROVED", requestedAmount: 1400, contractSendingAt: new Date() });
    expect((await prepareTopUpOffer(input)).ok).toBe(false);
    expect(mocks.appUpdate).not.toHaveBeenCalled();
  });
  it("sends only the new contract after an explicit send action", async () => {
    mocks.requestGet.mockResolvedValue({ status: "APPROVED", newApplication: { id: "child", offerStatus: "OFFERED" } });
    expect((await sendTopUpContract("request")).ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith("child");
  });
  it("refuses to send without prepared terms", async () => {
    expect((await sendTopUpContract("request")).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

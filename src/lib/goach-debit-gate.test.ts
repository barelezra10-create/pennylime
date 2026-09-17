import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ check: vi.fn(), fetch: vi.fn(), payment: vi.fn(), agreement: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findUnique: mocks.payment }, settlementAgreement: { findUnique: mocks.agreement, findFirst: mocks.active } } }));
vi.mock("@/lib/goach-balance-check", () => ({ checkGoachDebitBalance: mocks.check }));
vi.mock("@/lib/payment-processor", () => ({ goachEnv: () => ({ originatorUuid: "origin", apiKey: "test", baseUrl: "https://processor.invalid" }) }));
import { createTransaction } from "./goach";
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { uuid: "tx" } }) }); });
afterEach(() => vi.unstubAllGlobals());
it("never contacts GoACH when the live check blocks a debit", async () => {
  mocks.check.mockResolvedValue({ ok: false, skipped: true, error: "Not enough available balance" });
  expect(await createTransaction({ type: "Debit", applicationId: "app", bankAccountUuid: "bank", amountCents: 12345 })).toMatchObject({ ok: false, skipped: true });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("checks the actual debit amount before sending it", async () => {
  mocks.check.mockResolvedValue({ ok: true });
  const input = { type: "Debit" as const, applicationId: "app", bankAccountUuid: "bank", amountCents: 12345 };
  expect((await createTransaction(input)).ok).toBe(true);
  expect(mocks.check).toHaveBeenCalledWith(input);
  expect(mocks.check.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
  expect(mocks.fetch.mock.calls[0][1].body).toContain("amount=123.45");
});
it("does not apply a borrower balance check to funding credits", async () => {
  expect((await createTransaction({ type: "Credit", bankAccountUuid: "bank", amountCents: 10000 })).ok).toBe(true);
  expect(mocks.check).not.toHaveBeenCalled();
});

it("blocks a stale debit against a replaced installment before calling the bank", async () => {
  mocks.payment.mockResolvedValue({ applicationId: "app", status: "PROCESSING", supersededBySettlementId: "s" });
  expect((await createTransaction({ type: "Debit", applicationId: "app", paymentId: "old", bankAccountUuid: "bank", amountCents: 100 })).ok).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.check).not.toHaveBeenCalled();
});
it.each(["DRAFT", "SENT", "CANCELED"])("blocks collection under a %s settlement", async status => {
  mocks.payment.mockResolvedValue({ applicationId: "app", status: "PROCESSING", settlementId: "s", dueDate: new Date("2020-01-01") });
  mocks.agreement.mockResolvedValue({ status });
  expect((await createTransaction({ type: "Debit", applicationId: "app", paymentId: "p", bankAccountUuid: "bank", amountCents: 100 })).ok).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("blocks an early debit even for an active settlement", async () => {
  mocks.payment.mockResolvedValue({ applicationId: "app", status: "PROCESSING", settlementId: "s", dueDate: new Date("2100-01-01") });
  mocks.agreement.mockResolvedValue({ status: "ACTIVE" });
  expect((await createTransaction({ type: "Debit", applicationId: "app", paymentId: "p", bankAccountUuid: "bank", amountCents: 100 })).ok).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("blocks legacy payoff or skip collection while a settlement is pending or active", async () => {
  mocks.active.mockResolvedValue({ id: "settlement" });
  expect((await createTransaction({ type: "Debit", applicationId: "app", bankAccountUuid: "bank", amountCents: 100 })).ok).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("rejects even a one-cent overcharge on a signed settlement installment", async () => {
  mocks.payment.mockResolvedValue({ applicationId: "app", status: "PROCESSING", settlementId: "s", dueDate: new Date("2020-01-01"), amount: 100, lateFee: 0, collectedAmount: 30 });
  mocks.agreement.mockResolvedValue({ status: "ACTIVE" });
  expect((await createTransaction({ type: "Debit", applicationId: "app", paymentId: "p", bankAccountUuid: "bank", amountCents: 7001 })).ok).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

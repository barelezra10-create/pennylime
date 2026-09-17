import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ payment: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findUnique: m.payment } } }));
vi.mock("@/lib/payment-processor", () => ({ goachProductionReady: () => true }));
vi.mock("@/lib/goach", () => ({ goachConfigured: () => true, createTransaction: m.create }));
vi.mock("@/lib/goach-provision", () => ({ ensureGoachBankAccount: async () => ({ ok: true, bankAccountUuid: "bank" }) }));
import { initiateACHDebit } from "./plaid-transfer";
beforeEach(() => { vi.resetAllMocks(); m.create.mockResolvedValue({ ok: true, uuid: "transfer" }); });
it("only debits the remaining balance and returns that exact amount for the attempt ledger", async () => {
  m.payment.mockResolvedValue({ id: "p", applicationId: "a", amount: 100, lateFee: 0, collectedAmount: 30 });
  expect(await initiateACHDebit("p")).toMatchObject({ success: true, amount: 70 });
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ paymentId: "p", amountCents: 7000 }));
});
it("does not submit a debit for an already collected balance", async () => {
  m.payment.mockResolvedValue({ id: "p", applicationId: "a", amount: 100, lateFee: 0, collectedAmount: 100 });
  expect(await initiateACHDebit("p")).toMatchObject({ success: false, skipped: true });
  expect(m.create).not.toHaveBeenCalled();
});

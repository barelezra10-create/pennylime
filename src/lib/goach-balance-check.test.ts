import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ app: vi.fn(), updateApp: vi.fn(), updatePayment: vi.fn(), lastAttempt: vi.fn(), attempt: vi.fn(), balance: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { application: { findUnique: mocks.app, update: mocks.updateApp }, payment: { update: mocks.updatePayment }, paymentAttempt: { findFirst: mocks.lastAttempt, create: mocks.attempt } } }));
vi.mock("@/lib/plaid", () => ({ plaidClient: { accountsBalanceGet: mocks.balance } }));
vi.mock("@/lib/encryption", () => ({ decrypt: () => "access-token" }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
import { checkGoachDebitBalance } from "./goach-balance-check";
const input = { applicationId: "app", paymentId: "payment", bankAccountUuid: "bank", amountCents: 10001 };
const app = { plaidAccessToken: "encrypted", plaidAccountId: "selected", goachBankAccountUuid: "bank", bankAccountNumberManual: null };
const response = (available: number | null, id = "selected", currency = "USD") => ({ data: { accounts: [{ account_id: id, type: "depository", balances: { available, current: 9999, iso_currency_code: currency } }] } });
beforeEach(() => { vi.resetAllMocks(); mocks.app.mockResolvedValue(app); mocks.balance.mockResolvedValue(response(100.01)); mocks.lastAttempt.mockResolvedValue({ attemptNumber: 2 }); });

describe("live debit balance gate", () => {
  it("allows an exact-cent match and saves the fresh balance", async () => {
    expect(await checkGoachDebitBalance(input)).toEqual({ ok: true });
    expect(mocks.balance).toHaveBeenCalledWith({ access_token: "access-token", options: { account_ids: ["selected"] } }, { timeout: 30000 });
    expect(mocks.updateApp).toHaveBeenCalledWith({ where: { id: "app" }, data: { availableBalance: 100.01, bankBalance: 9999, lastPlaidRefresh: expect.any(Date) } });
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
  it("blocks a one-cent shortage even if the current balance is high and records a skipped check", async () => {
    mocks.balance.mockResolvedValue(response(100));
    expect(await checkGoachDebitBalance(input)).toMatchObject({ ok: false, skipped: true, error: expect.stringContaining("Not enough available balance") });
    expect(mocks.attempt).toHaveBeenCalledWith({ data: expect.objectContaining({ attemptNumber: 3, finalStatus: "SKIPPED", increaseTransferStatus: "not_submitted", amount: 100.01 }) });
    expect(mocks.updatePayment).toHaveBeenCalledWith({ where: { id: "payment" }, data: { increaseLastError: expect.stringContaining("No charge was sent") } });
  });
  it.each([null, NaN, Infinity])("holds unverifiable available balance %s without using current balance", async (balance) => {
    mocks.balance.mockResolvedValue(response(balance));
    expect(await checkGoachDebitBalance(input)).toMatchObject({ ok: false, skipped: true, error: expect.stringContaining("could not be verified") });
  });
  it("never uses another linked account or a different currency", async () => {
    mocks.balance.mockResolvedValue(response(9999, "other"));
    expect((await checkGoachDebitBalance(input)).ok).toBe(false);
    mocks.balance.mockResolvedValue(response(9999, "selected", "CAD"));
    expect((await checkGoachDebitBalance(input)).ok).toBe(false);
  });
  it.each([{ ...app, plaidAccessToken: null }, { ...app, plaidAccountId: null }, { ...app, bankAccountNumberManual: "manual" }, { ...app, goachBankAccountUuid: "other" }])("holds an unverified payment-bank mapping", async (value) => {
    mocks.app.mockResolvedValue(value);
    expect((await checkGoachDebitBalance(input)).ok).toBe(false);
    expect(mocks.balance).not.toHaveBeenCalled();
  });
  it("holds when Plaid fails, and records an application update for portal debits", async () => {
    mocks.balance.mockRejectedValue(new Error("unavailable"));
    expect((await checkGoachDebitBalance({ ...input, paymentId: undefined })).ok).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "app", action: "PAYMENT_SKIPPED_BALANCE" }));
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
});

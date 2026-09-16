import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  accountsGet: vi.fn(), accountsBalanceGet: vi.fn(), identityGet: vi.fn(), itemGet: vi.fn(), report: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { application: mocks } }));
vi.mock("@/lib/plaid", () => ({ plaidClient: mocks }));
vi.mock("@/lib/encryption", () => ({ decrypt: () => "token" }));
vi.mock("@/lib/plaid-products", () => ({ isPlaidProductEnabled: () => false }));
vi.mock("@/lib/auth-helpers", () => ({ requireNonSupportRole: vi.fn() }));
vi.mock("@/lib/refresh-bank-balance", () => ({ refreshBankBalance: vi.fn() }));
vi.mock("@/lib/plaid-report-cache", () => ({ getCachedAssetReport: mocks.report, getCachedAssetReportPdf: vi.fn() }));
import { fetchAndStoreIncome, fetchAssetReportAndStoreIncome } from "./plaid";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue({ id: "app", plaidAccessToken: "encrypted", plaidAccountId: "selected", plaidAssetReportToken: "report", monthlyIncome: 4000 });
  mocks.identityGet.mockResolvedValue({ data: { accounts: [{ account_id: "selected", name: "Checking", balances: { current: 999 }, owners: [] }] } });
  mocks.itemGet.mockResolvedValue({ data: { item: { institution_id: null } } });
  mocks.report.mockResolvedValue({ items: [{ accounts: [{ account_id: "selected", name: "Checking", balances: { current: 100, available: 90 }, transactions: [] }] }] });
});

it("submission gets metadata from Identity without reading or writing balances", async () => {
  expect((await fetchAndStoreIncome("app")).success).toBe(true);
  expect(mocks.accountsGet).not.toHaveBeenCalled();
  expect(mocks.accountsBalanceGet).not.toHaveBeenCalled();
  const data = mocks.update.mock.calls[0][0].data;
  expect(data.plaidAccountName).toBe("Checking");
  expect(data).not.toHaveProperty("bankBalance");
  expect(data).not.toHaveProperty("availableBalance");
  expect(data).not.toHaveProperty("lastPlaidRefresh");
});

it("initializes report balances independently of existing income and protects stored balances", async () => {
  expect((await fetchAssetReportAndStoreIncome("app")).success).toBe(true);
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { id: "app", bankBalance: null, availableBalance: null },
    data: { bankBalance: 100, availableBalance: 90, lastPlaidRefresh: expect.any(Date) },
  });
  const incomeUpdate = mocks.updateMany.mock.calls.find(([arg]) => "monthlyIncome" in arg.where)?.[0];
  expect(incomeUpdate.where).toEqual({ id: "app", monthlyIncome: null });
  expect(incomeUpdate.data).not.toHaveProperty("bankBalance");
  expect(incomeUpdate.data).not.toHaveProperty("availableBalance");
  expect(incomeUpdate.data).not.toHaveProperty("lastPlaidRefresh");
  expect(mocks.accountsBalanceGet).not.toHaveBeenCalled();
});

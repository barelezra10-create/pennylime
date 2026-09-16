import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), accounts: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ plaidClient: {
  itemPublicTokenExchange: mocks.exchange, accountsGet: mocks.accounts, authGet: mocks.auth,
} }));
vi.mock("@/lib/encryption", () => ({ encrypt: () => "encrypted" }));
import { POST } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ data: { access_token: "access", item_id: "item" } });
  mocks.accounts.mockResolvedValue({ data: { accounts: [{ account_id: "first" }, { account_id: "selected" }] } });
});
it("links the selected account without activating paid Auth", async () => {
  const response = await POST(new NextRequest("http://localhost/api/plaid/exchange-token", {
    method: "POST", body: JSON.stringify({ publicToken: "public", accountId: "selected" }),
  }));
  expect((await response.json()).accountId).toBe("selected");
  expect(mocks.auth).not.toHaveBeenCalled();
});
it("does not silently substitute the wrong account", async () => {
  const response = await POST(new NextRequest("http://localhost/api/plaid/exchange-token", {
    method: "POST", body: JSON.stringify({ publicToken: "public", accountId: "unknown" }),
  }));
  expect(response.status).toBe(400);
  expect(mocks.auth).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ link: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ plaidClient: { linkTokenCreate: mocks.link, userCreate: mocks.user } }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { POST } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.link.mockResolvedValue({ data: { link_token: "link" } });
});
afterEach(() => vi.unstubAllEnvs());
it.each(["", "auth,identity,assets"])("keeps Identity early and makes Auth optional for %s", async (products) => {
  vi.stubEnv("PLAID_PRODUCTS", products);
  const response = await POST(new NextRequest("http://localhost/api/plaid/create-link-token", {
    method: "POST", body: JSON.stringify({ applicationId: "app" }),
  }));
  expect(response.status).toBe(200);
  expect(mocks.link.mock.calls[0][0].products).toEqual(["identity", "assets"]);
  expect(mocks.link.mock.calls[0][0].optional_products).toEqual(["auth"]);
  expect(mocks.user).not.toHaveBeenCalled();
});

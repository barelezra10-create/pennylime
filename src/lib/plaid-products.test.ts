import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlaidProductEnabled } from "./plaid-products";
afterEach(() => vi.unstubAllEnvs());
describe("Plaid product opt-in", () => {
  it("does not activate Transactions or Income under the default setup", () => {
    vi.stubEnv("PLAID_PRODUCTS", "");
    expect(isPlaidProductEnabled("transactions")).toBe(false);
    expect(isPlaidProductEnabled("income_verification")).toBe(false);
    expect(isPlaidProductEnabled("assets")).toBe(true);
  });
  it("allows explicitly configured products", () => {
    vi.stubEnv("PLAID_PRODUCTS", "auth, Transactions , assets");
    expect(isPlaidProductEnabled("transactions")).toBe(true);
  });
});

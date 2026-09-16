import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountIdentity } from "plaid";
import { createIdentityReceipt, readIdentityReceipt } from "./plaid-identity-receipt";

const applicant = { encryptedAccessToken: "connection-one", firstName: "Jane", lastName: "Doe" };
const accounts = [{ account_id: "account-one", name: "Checking", mask: "1234", subtype: "checking", owners: [{ names: ["Jane Doe"], addresses: [{ data: { street: "1 Main St", city: "Boston", region: "MA", postal_code: "02101" } }], emails: [{ data: "jane@example.com" }], phone_numbers: [{ data: "5551234567" }] }] }] as AccountIdentity[];
beforeEach(() => vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32)));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("reuses authenticated metadata for the selected account without exposing it in the receipt", () => {
  const receipt = createIdentityReceipt(applicant, accounts, true);
  expect(receipt).not.toContain("Jane");
  expect(readIdentityReceipt(receipt, applicant, "account-one")).toEqual({
    identityNeedsReview: false, plaidAccountName: "Checking", plaidAccountMask: "1234", plaidAccountSubtype: "checking",
    plaidIdentityName: "Jane Doe", plaidIdentityAddress: "1 Main St, Boston, MA, 02101",
    plaidIdentityEmail: "jane@example.com", plaidIdentityPhone: "5551234567",
  });
});

it("rejects tampering, different connections, names, and accounts", () => {
  const receipt = createIdentityReceipt(applicant, accounts, true);
  const last = receipt.at(-1) === "0" ? "1" : "0";
  expect(readIdentityReceipt(receipt.slice(0, -1) + last, applicant)).toBeNull();
  expect(readIdentityReceipt(receipt, { ...applicant, encryptedAccessToken: "connection-two" })).toBeNull();
  expect(readIdentityReceipt(receipt, { ...applicant, firstName: "Someone" })).toBeNull();
  expect(readIdentityReceipt(receipt, applicant, "another-account")).toBeNull();
});

it("preserves a failed match and rejects missing or expired verification", () => {
  vi.useFakeTimers();
  const receipt = createIdentityReceipt(applicant, accounts, false);
  expect(readIdentityReceipt(receipt, applicant)?.identityNeedsReview).toBe(true);
  expect(readIdentityReceipt(undefined, applicant)).toBeNull();
  vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
  expect(readIdentityReceipt(receipt, applicant)).toBeNull();
});

import { createHash } from "crypto";
import type { AccountIdentity } from "plaid";
import { decrypt, encrypt } from "@/lib/encryption";

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.trim().toLowerCase();
type Applicant = { encryptedAccessToken: string; firstName: string; lastName: string };
type Receipt = {
  purpose: "plaid-identity";
  expires: number;
  connection: string;
  firstName: string;
  lastName: string;
  match: boolean;
  accounts: Array<{
    accountId: string;
    plaidAccountName: string | null;
    plaidAccountMask: string | null;
    plaidAccountSubtype: string | null;
    plaidIdentityName: string | null;
    plaidIdentityAddress: string | null;
    plaidIdentityEmail: string | null;
    plaidIdentityPhone: string | null;
  }>;
};

// Carry only the metadata we persist, encrypted and authenticated by the server.
// Binding to the connection and applicant prevents reuse for another application.
export function createIdentityReceipt(input: Applicant, accounts: AccountIdentity[], match: boolean) {
  const receipt: Receipt = {
    purpose: "plaid-identity",
    expires: Date.now() + 24 * 60 * 60 * 1000,
    connection: fingerprint(input.encryptedAccessToken),
    firstName: normalize(input.firstName),
    lastName: normalize(input.lastName),
    match,
    accounts: accounts.map((account) => {
      const owner = account.owners?.[0];
      const address = owner?.addresses?.[0]?.data;
      const tail = [address?.city, address?.region, address?.postal_code].filter(Boolean).join(", ");
      return {
        accountId: account.account_id,
        plaidAccountName: account.name ?? null,
        plaidAccountMask: account.mask ?? null,
        plaidAccountSubtype: account.subtype ?? null,
        plaidIdentityName: owner?.names?.[0] ?? null,
        plaidIdentityAddress: [address?.street, tail].filter(Boolean).join(", ") || null,
        plaidIdentityEmail: owner?.emails?.[0]?.data ?? null,
        plaidIdentityPhone: owner?.phone_numbers?.[0]?.data ?? null,
      };
    }),
  };
  return encrypt(JSON.stringify(receipt));
}

export function readIdentityReceipt(receipt: string | undefined, input: Applicant, accountId?: string) {
  if (!receipt) return null;
  try {
    const value = JSON.parse(decrypt(receipt)) as Receipt;
    if (value.purpose !== "plaid-identity" || !(value.expires > Date.now()) ||
      value.connection !== fingerprint(input.encryptedAccessToken) ||
      value.firstName !== normalize(input.firstName) || value.lastName !== normalize(input.lastName)) return null;
    const account = accountId
      ? value.accounts.find((candidate) => candidate.accountId === accountId)
      : value.accounts[0];
    if (!account) return null;
    const { accountId: _accountId, ...metadata } = account;
    void _accountId;
    return { ...metadata, identityNeedsReview: !value.match };
  } catch {
    return null;
  }
}

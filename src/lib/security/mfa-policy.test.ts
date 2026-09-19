import { describe, expect, it } from "vitest";
import { mfaRequired, validAdminSession } from "./mfa-policy";
const valid = { verified: true, tokenVersion: 2, currentVersion: 2, passkeyCount: 1, passwordStamp: "same", currentPasswordStamp: "same" };
describe("MFA enforcement", () => {
  it("requires MFA for enrolled users even during rollout", () => {
    expect(mfaRequired(1, false)).toBe(true);
    expect(validAdminSession({ ...valid, verified: false }, false)).toBe(false);
  });
  it("rejects password-only sessions once mandatory", () => {
    expect(validAdminSession({ ...valid, verified: false, passkeyCount: 0 }, true)).toBe(false);
  });
  it("invalidates old sessions on enrollment/recovery/password change", () => {
    expect(validAdminSession({ ...valid, tokenVersion: 1 }, false)).toBe(false);
    expect(validAdminSession({ ...valid, passwordStamp: "old" }, false)).toBe(false);
    expect(validAdminSession({ ...valid, tokenVersion: undefined, passwordStamp: undefined }, false)).toBe(false);
  });
  it("allows only verified current sessions and deliberate staged unenrolled access", () => {
    expect(validAdminSession(valid, true)).toBe(true);
    expect(validAdminSession({ ...valid, verified: false, passkeyCount: 0 }, false)).toBe(true);
  });
});

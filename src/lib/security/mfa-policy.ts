/** Enrolled accounts always require MFA; the flag enforces enrollment for everybody. */
export function mfaRequired(passkeyCount: number, enforced = process.env.ADMIN_MFA_REQUIRED === "true") {
  return enforced || passkeyCount > 0;
}
export function validAdminSession(input: {
  verified: unknown; tokenVersion: unknown; currentVersion: number; passkeyCount: number;
  passwordStamp: unknown; currentPasswordStamp: string;
}, enforced = process.env.ADMIN_MFA_REQUIRED === "true") {
  if (input.passwordStamp !== input.currentPasswordStamp) return false;
  if (input.tokenVersion !== input.currentVersion) return false;
  return !mfaRequired(input.passkeyCount, enforced) || input.verified === true;
}

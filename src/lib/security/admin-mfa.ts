import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { mfaRequired } from "./mfa-policy";

export const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
export function relyingParty() {
  const origin = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000").origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) throw new Error("HTTPS origin required");
  return { origin, rpID: new URL(origin).hostname };
}
export async function recordLoginFailure(email: string) {
  await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", entityType: "ADMIN_USER", entityId: "authentication", performedBy: email, details: null } });
}
export async function passwordUser(email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!email || email.length > 254 || !password || password.length > 1024) return null;
  // Persisted limit shared across all web instances; fail closed on DB errors.
  const failures = await prisma.auditLog.count({ where: { action: "LOGIN_FAILED", performedBy: email, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (failures >= 5) return null;
  const user = await prisma.adminUser.findUnique({ where: { email }, include: { passkeys: true } });
  // Equal bcrypt work for an unknown account.
  const valid = await bcrypt.compare(password, user?.passwordHash || "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
  if (!user || !valid) { await recordLoginFailure(email); return null; }
  return user;
}
export async function beginMfa(email: string, password: string, enrollmentCode = "") {
  const user = await passwordUser(email, password);
  if (!user) throw new Error("Invalid sign-in details or too many attempts. Try again later.");
  const { rpID } = relyingParty();
  const id = randomBytes(32).toString("base64url");
  let enrollmentHash: string | null = null;
  const purpose = user.passkeys.length ? "authenticate" : "register";
  if (purpose === "register") {
    if (!enrollmentCode && !mfaRequired(0)) return { mode: "password" as const };
    enrollmentHash = fingerprint(enrollmentCode);
    if (!user.mfaEnrollmentHash || !user.mfaEnrollmentExpiresAt || user.mfaEnrollmentExpiresAt <= new Date() ||
      !timingSafeEqual(Buffer.from(enrollmentHash), Buffer.from(user.mfaEnrollmentHash))) {
      await recordLoginFailure(user.email);
      throw new Error("Ask your security administrator for a current passkey enrollment code.");
    }
  }
  const options = purpose === "register"
    ? await generateRegistrationOptions({ rpName: "PennyLime Admin", rpID, userName: user.email,
      userID: new TextEncoder().encode(user.id), attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" } })
    : await generateAuthenticationOptions({ rpID, userVerification: "required",
      allowCredentials: user.passkeys.map(p => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })) });
  await prisma.adminMfaChallenge.create({ data: { id, adminId: user.id, challenge: options.challenge, purpose, enrollmentHash, expiresAt: new Date(Date.now() + 5 * 60_000) } });
  return { mode: purpose, challengeId: id, options };
}
export async function completeMfa(user: NonNullable<Awaited<ReturnType<typeof passwordUser>>>, challengeId: string, responseJSON: string) {
  if (!challengeId || responseJSON.length > 32_000) return null;
  const challenge = await prisma.adminMfaChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.adminId !== user.id || challenge.expiresAt <= new Date()) return null;
  // Consume BEFORE verification. A failed or racing assertion cannot be retried/replayed.
  const consumed = await prisma.adminMfaChallenge.deleteMany({ where: { id: challenge.id, adminId: user.id } });
  if (consumed.count !== 1) return null;
  const { origin, rpID } = relyingParty();
  const response = JSON.parse(responseJSON);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "AdminUser" WHERE "id" = ${user.id} FOR UPDATE`;
    const current = await tx.adminUser.findUniqueOrThrow({ where: { id: user.id }, include: { passkeys: true } });
    if (current.passwordHash !== user.passwordHash) return null;
    if (challenge.purpose === "register") {
      if (current.passkeys.length || !current.mfaEnrollmentHash || current.mfaEnrollmentHash !== challenge.enrollmentHash ||
          !current.mfaEnrollmentExpiresAt || current.mfaEnrollmentExpiresAt <= new Date()) return null;
      const result = await verifyRegistrationResponse({ response: response as RegistrationResponseJSON, expectedChallenge: challenge.challenge,
        expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!result.verified || !result.registrationInfo) return null;
      const c = result.registrationInfo.credential;
      await tx.adminPasskey.create({ data: { id: c.id, adminId: user.id, publicKey: Buffer.from(c.publicKey), counter: BigInt(c.counter), transports: c.transports ?? [] } });
      const updated = await tx.adminUser.update({ where: { id: user.id }, data: { mfaEnrollmentHash: null, mfaEnrollmentExpiresAt: null, mfaVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { action: "MFA_ENROLLED", entityType: "ADMIN_USER", entityId: user.id, performedBy: user.email } });
      return updated.mfaVersion;
    }
    const key = current.passkeys.find(p => p.id === response.id);
    if (!key) return null;
    const result = await verifyAuthenticationResponse({ response: response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports as AuthenticatorTransportFuture[] } });
    if (!result.verified) return null;
    await tx.adminPasskey.update({ where: { id: key.id }, data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() } });
    return current.mfaVersion;
  });
}

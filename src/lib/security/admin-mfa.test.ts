import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prisma: { adminMfaChallenge: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    adminUser: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    adminPasskey: { create: vi.fn(), update: vi.fn() }, auditLog: { count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn() },
  registration: vi.fn(), authentication: vi.fn(), compare: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: mocks.registration, verifyAuthenticationResponse: mocks.authentication,
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "challenge" })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "challenge" })),
}));
import { beginMfa, completeMfa, passwordUser, fingerprint } from "./admin-mfa";
const user = { id: "u1", email: "admin@example.com", passwordHash: "hash", mfaVersion: 1,
  mfaEnrollmentHash: fingerprint("enrollment"), mfaEnrollmentExpiresAt: new Date(Date.now() + 100000),
  passkeys: [{ id: "key", publicKey: new Uint8Array([1]), counter: BigInt(0), transports: [] }] };
const challenge = { id: "challenge-id", adminId: "u1", challenge: "challenge", purpose: "authenticate", expiresAt: new Date(Date.now() + 100000) };
describe("passkey login security", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NEXTAUTH_URL", "https://pennylime.com");
    mocks.prisma.adminMfaChallenge.findUnique.mockResolvedValue(challenge);
    mocks.prisma.adminMfaChallenge.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.adminUser.findUniqueOrThrow.mockResolvedValue(user);
    mocks.prisma.$transaction.mockImplementation(async fn => fn(mocks.prisma));
    mocks.authentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
  });
  it("rejects expired or cross-user challenges without verifying", async () => {
    mocks.prisma.adminMfaChallenge.findUnique.mockResolvedValue({ ...challenge, adminId: "someone-else" });
    expect(await completeMfa(user as never, "challenge-id", '{"id":"key"}')).toBeNull();
    mocks.prisma.adminMfaChallenge.findUnique.mockResolvedValue({ ...challenge, expiresAt: new Date(0) });
    expect(await completeMfa(user as never, "challenge-id", '{"id":"key"}')).toBeNull();
    expect(mocks.authentication).not.toHaveBeenCalled();
  });
  it("rejects a replay consumed by another request", async () => {
    mocks.prisma.adminMfaChallenge.deleteMany.mockResolvedValue({ count: 0 });
    expect(await completeMfa(user as never, "challenge-id", '{"id":"key"}')).toBeNull();
    expect(mocks.authentication).not.toHaveBeenCalled();
  });
  it("binds verification to canonical origin, RP, challenge and user verification", async () => {
    expect(await completeMfa(user as never, "challenge-id", '{"id":"key"}')).toBe(1);
    expect(mocks.authentication).toHaveBeenCalledWith(expect.objectContaining({ expectedOrigin: "https://pennylime.com", expectedRPID: "pennylime.com", expectedChallenge: "challenge", requireUserVerification: true }));
    expect(mocks.prisma.adminPasskey.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ counter: BigInt(1) }) }));
  });
  it("rejects another account's credential and password rotation during ceremony", async () => {
    expect(await completeMfa(user as never, "challenge-id", '{"id":"other"}')).toBeNull();
    mocks.prisma.adminUser.findUniqueOrThrow.mockResolvedValue({ ...user, passwordHash: "changed" });
    expect(await completeMfa(user as never, "challenge-id", '{"id":"key"}')).toBeNull();
  });
  it("does not let enrollment replace an already enrolled credential", async () => {
    mocks.prisma.adminMfaChallenge.findUnique.mockResolvedValue({ ...challenge, purpose: "register", enrollmentHash: user.mfaEnrollmentHash });
    expect(await completeMfa(user as never, "challenge-id", '{}')).toBeNull();
    expect(mocks.registration).not.toHaveBeenCalled();
  });
  it("requires independent enrollment code even with a correct password", async () => {
    mocks.prisma.auditLog.count.mockResolvedValue(0); mocks.compare.mockResolvedValue(true);
    mocks.prisma.adminUser.findUnique.mockResolvedValue({ ...user, passkeys: [] });
    vi.stubEnv("ADMIN_MFA_REQUIRED", "true");
    await expect(beginMfa(user.email, "password", "wrong")).rejects.toThrow("enrollment code");
    expect(mocks.prisma.adminMfaChallenge.create).not.toHaveBeenCalled();
  });
  it("locks out repeated failures before password checking", async () => {
    mocks.prisma.auditLog.count.mockResolvedValue(5);
    expect(await passwordUser(user.email, "password")).toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});

/** Run only on a trusted operator terminal; never put enrollment codes in tickets or logs. */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import { writeFileSync } from "node:fs";
const [email, outputFile] = process.argv.slice(2);
if (!email || !outputFile) throw new Error("Usage: npx tsx scripts/admin-mfa-enrollment.ts EMAIL PRIVATE_OUTPUT_FILE");
async function main() {
  const code = randomBytes(32).toString("base64url");
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: email.toLowerCase() }, include: { _count: { select: { passkeys: true } } } });
  if (user._count.passkeys) throw new Error("Already enrolled. Recovery requires an independently verified operator procedure; this command cannot replace a passkey.");
  // Never emit the enrollment credential to stdout / CI logs.
  writeFileSync(outputFile, `${code}\n`, { mode: 0o600, flag: "wx" });
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: user.id }, data: {
      mfaEnrollmentHash: createHash("sha256").update(code).digest("hex"),
      mfaEnrollmentExpiresAt: new Date(Date.now() + 30 * 60_000),
    } }),
    prisma.auditLog.create({ data: { action: "MFA_ENROLLMENT_ISSUED", entityType: "ADMIN_USER", entityId: user.id, performedBy: "trusted-operator" } }),
  ]);
  console.log("Enrollment code written to the private output file; expires in 30 minutes. Deliver directly to the verified account holder.");
}
main().finally(() => prisma.$disconnect());

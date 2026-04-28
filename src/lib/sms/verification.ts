import "server-only";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/twilio";
import { getTrackingConfig } from "@/lib/tracking/config";
import { normalizePhone } from "@/lib/tracking/hash";

const CODE_TTL_MIN = 10;
const RATE_LIMIT_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type SendCodeResult =
  | { ok: true; sentTo: string; expiresInSeconds: number; testCode?: string }
  | { ok: false; error: string };

export async function sendVerificationCode(opts: {
  phone: string;
  ipAddress?: string;
  contactId?: string;
}): Promise<SendCodeResult> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return { ok: false, error: "invalid phone number" };

  // Rate-limit: max 3 sends per phone per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSends = await prisma.phoneVerification.count({
    where: { phone, createdAt: { gte: oneHourAgo } },
  });
  if (recentSends >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, error: "too many verification requests, try again in an hour" };
  }

  const code = String(randomInt(100000, 1000000)); // 6-digit
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

  await prisma.phoneVerification.create({
    data: {
      phone,
      codeHash: hashCode(code),
      expiresAt,
      ipAddress: opts.ipAddress || null,
      contactId: opts.contactId || null,
    },
  });

  const body = `PennyLime verification code: ${code}. Expires in ${CODE_TTL_MIN} minutes. Reply STOP to opt out.`;

  // Determine if we should bypass real SMS sending
  const cfg = await getTrackingConfig();
  const twilioConfigured = !!(cfg.twilioAccountSid && cfg.twilioAuthToken && (cfg.twilioFromNumber || cfg.twilioMessagingServiceSid));

  if (!twilioConfigured) {
    // Test mode: return the code so the frontend can show it (no real SMS sent)
    console.warn(`[phone-verify] Twilio not configured — returning code in response for testing. Phone: ${phone}, code: ${code}`);
    return { ok: true, sentTo: phone, expiresInSeconds: CODE_TTL_MIN * 60, testCode: code };
  }

  const send = await sendSms({ to: phone, body });
  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  // Even when Twilio is configured, surface the code if global testMode is on
  if (cfg.testMode) {
    return { ok: true, sentTo: phone, expiresInSeconds: CODE_TTL_MIN * 60, testCode: code };
  }

  return { ok: true, sentTo: phone, expiresInSeconds: CODE_TTL_MIN * 60 };
}

export type CheckCodeResult =
  | { ok: true; verified: true }
  | { ok: false; error: string; attemptsLeft?: number };

export async function checkVerificationCode(opts: {
  phone: string;
  code: string;
  contactId?: string;
}): Promise<CheckCodeResult> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return { ok: false, error: "invalid phone number" };

  const code = (opts.code || "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "invalid code format" };

  // Find latest unverified, non-expired verification for this phone
  const record = await prisma.phoneVerification.findFirst({
    where: { phone, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, error: "no active verification, request a new code" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too many attempts, request a new code" };

  const ok = constantTimeEq(record.codeHash, hashCode(code));
  if (!ok) {
    const updated = await prisma.phoneVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      error: "incorrect code",
      attemptsLeft: Math.max(MAX_ATTEMPTS - updated.attempts, 0),
    };
  }

  await prisma.phoneVerification.update({
    where: { id: record.id },
    data: { verifiedAt: new Date(), contactId: opts.contactId || record.contactId },
  });

  // Mark contact as verified if linked
  if (opts.contactId) {
    await prisma.contact.update({
      where: { id: opts.contactId },
      data: { phoneVerifiedAt: new Date(), smsOptIn: true },
    }).catch(() => {});
  } else {
    // Try to find contact by phone and mark verified
    await prisma.contact.updateMany({
      where: { phone, phoneVerifiedAt: null },
      data: { phoneVerifiedAt: new Date() },
    }).catch(() => {});
  }

  return { ok: true, verified: true };
}

export async function isPhoneVerified(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const verified = await prisma.phoneVerification.findFirst({
    where: { phone: normalized, verifiedAt: { not: null } },
    orderBy: { verifiedAt: "desc" },
  });
  return !!verified;
}

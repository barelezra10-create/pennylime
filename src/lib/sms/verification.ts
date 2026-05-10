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

async function sendViaTwilioVerify(opts: {
  phone: string;
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `https://verify.twilio.com/v2/Services/${opts.verifyServiceSid}/Verifications`;
  const auth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");
  const params = new URLSearchParams({ To: opts.phone, Channel: "sms" });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Twilio Verify ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

async function checkViaTwilioVerify(opts: {
  phone: string;
  code: string;
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
}): Promise<{ ok: true; approved: boolean } | { ok: false; error: string }> {
  const url = `https://verify.twilio.com/v2/Services/${opts.verifyServiceSid}/VerificationCheck`;
  const auth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");
  const params = new URLSearchParams({ To: opts.phone, Code: opts.code });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Twilio Verify ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { status: string };
    return { ok: true, approved: data.status === "approved" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

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

  const cfg = await getTrackingConfig();
  const verifyConfigured = !!(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioVerifyServiceSid);

  // ── Path 1: Twilio Verify (preferred when configured) ─────────────
  // Verify is Twilio's purpose-built OTP product. They handle code generation,
  // delivery, retries, and abuse prevention server-side. No A2P 10DLC required.
  // We still record the attempt locally for rate-limiting + audit, but the
  // codeHash is unused on the Verify path.
  if (verifyConfigured) {
    await prisma.phoneVerification.create({
      data: {
        phone,
        codeHash: "TWILIO_VERIFY", // sentinel; Verify owns the code
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
        ipAddress: opts.ipAddress || null,
        contactId: opts.contactId || null,
      },
    });
    const send = await sendViaTwilioVerify({
      phone,
      accountSid: cfg.twilioAccountSid!,
      authToken: cfg.twilioAuthToken!,
      verifyServiceSid: cfg.twilioVerifyServiceSid!,
    });
    if (!send.ok) return { ok: false, error: send.error };
    return { ok: true, sentTo: phone, expiresInSeconds: CODE_TTL_MIN * 60 };
  }

  // ── Path 2: Local code + classic Twilio SMS ───────────────────────
  // Fallback when Verify isn't configured. Generates the code ourselves,
  // sends via classic SMS. Requires A2P 10DLC for production US delivery.
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

  // ── Twilio Verify path ────────────────────────────────────────────
  // The record was created with codeHash="TWILIO_VERIFY" when Verify was the
  // sender, so we delegate the actual code check to Twilio's API. They handle
  // expiration and attempt limits on their side too, but we still track
  // attempts locally for rate-limiting.
  if (record.codeHash === "TWILIO_VERIFY") {
    const cfg = await getTrackingConfig();
    if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioVerifyServiceSid) {
      return { ok: false, error: "Twilio Verify config missing" };
    }
    const check = await checkViaTwilioVerify({
      phone,
      code,
      accountSid: cfg.twilioAccountSid,
      authToken: cfg.twilioAuthToken,
      verifyServiceSid: cfg.twilioVerifyServiceSid,
    });
    if (!check.ok) return { ok: false, error: check.error };
    if (!check.approved) {
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
    if (opts.contactId) {
      await prisma.contact.update({
        where: { id: opts.contactId },
        data: { phoneVerifiedAt: new Date(), smsOptIn: true },
      }).catch(() => {});
    } else {
      await prisma.contact.updateMany({
        where: { phone, phoneVerifiedAt: null },
        data: { phoneVerifiedAt: new Date() },
      }).catch(() => {});
    }
    return { ok: true, verified: true };
  }

  // ── Local hash-compare path (legacy / fallback) ───────────────────
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

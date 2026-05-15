"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/emails/send";
import { sendSms } from "@/lib/sms/twilio";
import { TRANSACTIONAL_CATALOG } from "@/lib/notifications/transactional-catalog";

export async function sendAllTransactionalTests(to: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, error: "Not authenticated" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: "Invalid email address" };
  }

  const results: { id: string; name: string; ok: boolean; error?: string }[] = [];

  for (const entry of TRANSACTIONAL_CATALOG) {
    if (!entry.email) continue;
    const res = await sendEmail({
      to,
      subject: `[TEST] ${entry.email.subject}`,
      html: entry.email.html,
    });
    results.push({
      id: entry.id,
      name: entry.name,
      ok: res.success,
      error: res.success ? undefined : String(res.error ?? "unknown error"),
    });
  }

  const sent = results.filter((r) => r.ok).length;
  return { ok: true, sent, total: results.length, results };
}

export async function sendAllTransactionalSmsTests(toPhone: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, error: "Not authenticated" };
  }

  const digits = toPhone.replace(/\D/g, "");
  if (digits.length < 10) {
    return { ok: false, error: "Invalid phone number" };
  }

  const results: { id: string; name: string; ok: boolean; error?: string }[] = [];

  for (const entry of TRANSACTIONAL_CATALOG) {
    if (!entry.sms) continue;
    const res = await sendSms({
      to: toPhone,
      body: `[TEST] ${entry.sms}`,
    });
    results.push({
      id: entry.id,
      name: entry.name,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });
  }

  const sent = results.filter((r) => r.ok).length;
  return { ok: true, sent, total: results.length, results };
}

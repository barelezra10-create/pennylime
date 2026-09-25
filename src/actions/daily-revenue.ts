"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { sendDailyRevenueReportForDate } from "@/lib/daily-revenue";
import { easternDateString } from "@/lib/eastern-time";

function normalizeRecipients(value: string) {
  return Array.from(new Set(value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))).join(",");
}

export async function saveDailyRevenueRecipients(value: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const recipients = normalizeRecipients(value);
  await prisma.notificationConfig.upsert({
    where: { id: "singleton" },
    update: { dailyRevenueEmails: recipients },
    create: { id: "singleton", dailyRevenueEmails: recipients },
  });
  await prisma.auditLog.create({ data: {
    action: "UPDATE_DAILY_REVENUE_RECIPIENTS",
    entityType: "SETTINGS",
    entityId: "singleton",
    performedBy: auth.email,
  } });
  revalidatePath("/admin/revenue");
  return { ok: true as const, recipients };
}

export async function sendDailyRevenueReportNow() {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const date = easternDateString();
  const result = await sendDailyRevenueReportForDate(date);
  if (result.skipped === "no recipients configured") return { ok: false as const, error: "Add at least one report recipient first." };
  if (result.skipped === "already sent") return { ok: false as const, error: "Today’s report has already been sent." };
  if (!result.failed) revalidatePath("/admin/revenue");
  return result.failed
    ? { ok: false as const, error: `Report sent to ${result.sent} recipients; ${result.failed} failed.` }
    : { ok: true as const, sent: result.sent, date };
}

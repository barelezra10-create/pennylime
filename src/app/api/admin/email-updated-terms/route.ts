import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/emails/send";
import { paymentTermsUpdatedEmail } from "@/lib/emails/payment-terms-updated";

/**
 * One-off: email a specific set of borrowers their updated payment schedule.
 * POST with `Authorization: Bearer <CRON_SECRET>` and body { codes: string[] }
 * (application codes). Targeted on purpose — it only emails the codes passed,
 * never the whole book. Skips any code that has no unpaid schedule.
 */
export async function POST(request: NextRequest) {
  const unauth = verifyCronSecret(request);
  if (unauth) return unauth;

  const body = (await request.json().catch(() => ({}))) as { codes?: string[] };
  const codes = Array.isArray(body.codes) ? body.codes.map((c) => c.toUpperCase()) : [];
  if (codes.length === 0) {
    return NextResponse.json({ error: "Provide codes: string[]" }, { status: 400 });
  }

  const results: Array<{ code: string; sent: boolean; to?: string; reason?: string }> = [];
  for (const code of codes) {
    const app = await prisma.application.findUnique({
      where: { applicationCode: code },
      select: {
        id: true,
        firstName: true,
        email: true,
        applicationCode: true,
        paymentFrequency: true,
        contact: { select: { id: true } },
        payments: {
          where: { status: "PENDING", paidAt: null },
          orderBy: [{ dueDate: "asc" }, { paymentNumber: "asc" }],
          select: { paymentNumber: true, dueDate: true, amount: true },
        },
      },
    });
    if (!app) {
      results.push({ code, sent: false, reason: "not found" });
      continue;
    }
    if (app.payments.length === 0) {
      results.push({ code, sent: false, reason: "no unpaid schedule" });
      continue;
    }

    const schedule = app.payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      dueDate: new Date(p.dueDate),
      amount: Number(p.amount),
    }));
    const email = paymentTermsUpdatedEmail({
      firstName: app.firstName,
      applicationCode: app.applicationCode,
      firstDueDate: schedule[0].dueDate,
      schedule,
      frequency: app.paymentFrequency === "DAILY" ? "DAILY" : "WEEKLY",
    });

    const r = await sendEmail({
      to: app.email,
      subject: email.subject,
      html: email.html,
      preheader: email.preheader,
      contactId: app.contact?.id,
      templateId: "payment-terms-updated",
    });
    results.push({ code, sent: !!r.success, to: app.email, reason: r.success ? undefined : "send failed" });
  }

  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, sent, total: codes.length, results });
}

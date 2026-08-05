import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/emails/send";
import { paymentReminderEmail } from "@/lib/emails/payment-reminder";
import { sendSms } from "@/lib/sms/twilio";
import { paymentReminderSms, fundsReadyReminderSms } from "@/lib/sms/transactional";
import { fundsReadyReminderEmail } from "@/lib/emails/payment-rolled";
import { calculateRemainingBalance } from "@/lib/amortization";
import { paymentsPausedUntil } from "@/lib/payment-pause";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const pausedUntil = await paymentsPausedUntil();
  if (pausedUntil) {
    return NextResponse.json({ paused: true, resumesOn: pausedUntil.toISOString(), reminders: 0 });
  }

  // Find payments due tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const upcomingPayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { gte: tomorrow, lte: tomorrowEnd },
    },
    include: {
      application: {
        include: { payments: true },
      },
    },
  });

  let sent = 0;

  for (const payment of upcomingPayments) {
    const remaining = calculateRemainingBalance(
      payment.application.payments.map((p) => ({
        principal: Number(p.principal),
        status: p.status,
      }))
    );

    const contact = await prisma.contact.findFirst({
      where: { applicationId: payment.applicationId },
      select: { id: true },
    });
    await sendEmail({
      to: payment.application.email,
      ...paymentReminderEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
        remainingBalance: remaining,
      }),
      contactId: contact?.id,
      templateId: "payment-reminder",
    });

    await sendSms({
      to: payment.application.phone,
      body: paymentReminderSms({
        firstName: payment.application.firstName,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
      }),
      contactId: contact?.id,
      templateId: "payment-reminder",
    });

    sent++;
  }

  // Recovery nudge: 2 days before the next payment, for borrowers who recently
  // bounced (they have an unpaid rolled replacement on file). Extra "have funds
  // ready" message so they don't NSF again.
  const inTwoDays = new Date();
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  inTwoDays.setHours(0, 0, 0, 0);
  const inTwoDaysEnd = new Date(inTwoDays);
  inTwoDaysEnd.setHours(23, 59, 59, 999);

  const recoveryPayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      isLateFee: false,
      dueDate: { gte: inTwoDays, lte: inTwoDaysEnd },
      // Application is still working off a rolled obligation.
      application: { payments: { some: { rollCount: { gt: 0 }, status: "PENDING" } } },
    },
    include: { application: { select: { firstName: true, email: true, phone: true, applicationCode: true } } },
  });

  let recoverySent = 0;
  for (const payment of recoveryPayments) {
    const contact = await prisma.contact.findFirst({
      where: { applicationId: payment.applicationId },
      select: { id: true },
    });
    await sendEmail({
      to: payment.application.email,
      ...fundsReadyReminderEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
      }),
      contactId: contact?.id,
      templateId: "funds-ready-reminder",
    });
    await sendSms({
      to: payment.application.phone,
      body: fundsReadyReminderSms({
        firstName: payment.application.firstName,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
      }),
      contactId: contact?.id,
      templateId: "funds-ready-reminder",
    });
    recoverySent++;
  }

  return NextResponse.json({ reminders: sent, recoveryReminders: recoverySent });
}

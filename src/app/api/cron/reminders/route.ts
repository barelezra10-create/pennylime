import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/emails/send";
import { paymentReminderEmail } from "@/lib/emails/payment-reminder";
import { sendSms } from "@/lib/sms/twilio";
import { paymentReminderSms, fundsReadyReminderSms, upcomingPaymentSms } from "@/lib/sms/transactional";
import { fundsReadyReminderEmail } from "@/lib/emails/payment-rolled";
import { upcomingPaymentEmail } from "@/lib/emails/upcoming-payment";
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
      // Collections/defaulted accounts are handled by the collections flow, not
      // "your payment is coming up" reminders.
      application: { status: { notIn: ["COLLECTIONS", "DEFAULTED"] } },
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

  // Heads-up: 3 days before the debit, for every active advance. Gives the
  // borrower time to fund the account before the day-before reminder above.
  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  inThreeDays.setHours(0, 0, 0, 0);
  const inThreeDaysEnd = new Date(inThreeDays);
  inThreeDaysEnd.setHours(23, 59, 59, 999);

  const headsUpPayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { gte: inThreeDays, lte: inThreeDaysEnd },
      application: { status: { notIn: ["COLLECTIONS", "DEFAULTED"] } },
    },
    include: { application: { include: { payments: true } } },
  });

  let headsUpSent = 0;
  for (const payment of headsUpPayments) {
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
      ...upcomingPaymentEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
        daysUntil: 3,
        remainingBalance: remaining,
      }),
      contactId: contact?.id,
      templateId: "payment-heads-up",
    });
    await sendSms({
      to: payment.application.phone,
      body: upcomingPaymentSms({
        firstName: payment.application.firstName,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
        daysUntil: 3,
      }),
      contactId: contact?.id,
      templateId: "payment-heads-up",
    });
    headsUpSent++;
  }

  // Recovery nudge: 2 days before the next payment, for borrowers who recently
  // bounced (rolled replacement on file) OR are currently flagged LATE. Extra
  // "have funds ready" message so they don't NSF again.
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
      // Borrower recently had a late payment: either still working off a rolled
      // obligation, or the advance is currently flagged LATE. Never collections/
      // defaulted — those get the collections flow, not payment reminders.
      application: {
        status: { notIn: ["COLLECTIONS", "DEFAULTED"] },
        OR: [
          { payments: { some: { rollCount: { gt: 0 }, status: "PENDING" } } },
          { status: "LATE" },
        ],
      },
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

  return NextResponse.json({ reminders: sent, headsUp: headsUpSent, recoveryReminders: recoverySent });
}

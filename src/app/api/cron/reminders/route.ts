import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/emails/send";
import { paymentReminderEmail } from "@/lib/emails/payment-reminder";
import { calculateRemainingBalance } from "@/lib/amortization";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

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
    });

    sent++;
  }

  return NextResponse.json({ reminders: sent });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getLoanRules } from "@/lib/rules-engine";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { lateFeeAddedEmail } from "@/lib/emails/late-fee-added";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const rules = await getLoanRules();
  const lateFeeAmount = parseFloat(rules.late_fee_amount || "25");
  const graceDays = parseInt(rules.late_fee_grace_days || "3");

  const graceDate = new Date();
  graceDate.setDate(graceDate.getDate() - graceDays);
  graceDate.setHours(23, 59, 59, 999);

  // Find FAILED payments past the grace period that don't already have a late fee
  const overduePayments = await prisma.payment.findMany({
    where: {
      status: "FAILED",
      dueDate: { lte: graceDate },
      lateFee: 0,
    },
    include: { application: true },
  });

  let feesAdded = 0;

  for (const payment of overduePayments) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { lateFee: lateFeeAmount },
    });

    await logAudit({
      action: "ADD_LATE_FEE",
      entityType: "PAYMENT",
      entityId: payment.id,
      performedBy: "system:late-fees",
      details: { lateFeeAmount, daysOverdue: graceDays + 1 },
    });

    await sendEmail({
      to: payment.application.email,
      ...lateFeeAddedEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        lateFeeAmount,
        originalAmount: Number(payment.amount),
        totalDue: Number(payment.amount) + lateFeeAmount,
      }),
    });

    feesAdded++;
  }

  return NextResponse.json({ checked: overduePayments.length, feesAdded });
}

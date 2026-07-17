import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { initiateACHDebit } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import { sendSms } from "@/lib/sms/twilio";
import { paymentFailedSms } from "@/lib/sms/transactional";
import { paymentsPausedUntil } from "@/lib/payment-pause";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const pausedUntil = await paymentsPausedUntil();
  if (pausedUntil) {
    return NextResponse.json({ paused: true, resumesOn: pausedUntil.toISOString(), processed: 0 });
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Find all PENDING payments due today or earlier
  const duePayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: today },
    },
    include: { application: true },
  });

  const results: { paymentId: string; success: boolean; error?: string }[] = [];

  for (const payment of duePayments) {
    // Set to PROCESSING first to prevent double-debit
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PROCESSING" },
    });

    const result = await initiateACHDebit(payment.id);

    if (result.success) {
      // Set BOTH columns: achTransferId is legacy (Plaid Transfer era);
      // increaseTransferId is what the Increase webhook handler matches on.
      const { applyDebitInitiation } = await import("@/lib/debit-writeback");
      await applyDebitInitiation(payment.id, result.transferId);

      await logAudit({
        action: "INITIATE_ACH",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-processor",
        details: { transferId: result.transferId, amount: Number(payment.amount) },
      });

      const { recordAttemptStart } = await import("@/lib/payment-attempts");
      await recordAttemptStart({
        paymentId: payment.id,
        initiatedBy: "system:payment-processor",
        amount: Number(payment.amount) + Number(payment.lateFee),
        transferId: result.transferId,
      });

      try {
        const { notifyPaymentInitiated } = await import("@/lib/notify-payment");
        await notifyPaymentInitiated({
          applicationId: payment.applicationId,
          applicationCode: payment.application.applicationCode,
          borrowerName: `${payment.application.firstName} ${payment.application.lastName}`.trim(),
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount) + Number(payment.lateFee),
          source: "cron",
        });
      } catch (notifyErr) {
        console.error(`[payment-processor] notify initiate failed for ${payment.id}:`, notifyErr);
      }

      results.push({ paymentId: payment.id, success: true });
    } else {
      // Revert to FAILED if ACH initiation fails
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", retryCount: { increment: 1 }, lastRetryAt: new Date() },
      });

      const failContact = await prisma.contact.findFirst({
        where: { applicationId: payment.applicationId },
        select: { id: true },
      });
      // Send failure email to borrower (spec: Day 0 failure notification)
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
        contactId: failContact?.id,
        templateId: "payment-failed",
      });
      await sendSms({
        to: payment.application.phone,
        body: paymentFailedSms({
          firstName: payment.application.firstName,
          amount: Number(payment.amount),
          paymentNumber: payment.paymentNumber,
        }),
        contactId: failContact?.id,
      });

      try {
        const { notifyPaymentFailed } = await import("@/lib/notify-payment");
        await notifyPaymentFailed({
          applicationId: payment.applicationId,
          applicationCode: payment.application.applicationCode,
          borrowerName: `${payment.application.firstName} ${payment.application.lastName}`.trim(),
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount) + Number(payment.lateFee),
          source: "cron",
          reason: result.error,
        });
      } catch (notifyErr) {
        console.error(`[payment-processor] notify failed for ${payment.id}:`, notifyErr);
      }

      results.push({ paymentId: payment.id, success: false, error: result.error });
    }
  }

  return NextResponse.json({
    processed: duePayments.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}

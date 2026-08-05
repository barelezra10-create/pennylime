import { prisma } from "@/lib/db";
import { getLoanRules } from "@/lib/rules-engine";
import { computeRollPlan, MAX_ROLLS, type Frequency } from "@/lib/nsf-roll";
import { sendEmail } from "@/lib/emails/send";
import { paymentRolledEmail } from "@/lib/emails/payment-rolled";
import { sendSms } from "@/lib/sms/twilio";
import { paymentRolledSms } from "@/lib/sms/transactional";

// Application statuses where we should NOT roll (already terminal or in
// collections). A rolled advance that hits the cap moves to COLLECTIONS.
const NON_ROLLABLE_APP_STATUSES = ["COLLECTIONS", "DEFAULTED", "PAID_OFF", "CANCELED", "REJECTED"];

export type RollOutcome =
  | { status: "rolled"; paymentId: string; replacementId: string; lateFeeId: string | null }
  | { status: "collections"; paymentId: string }
  | { status: "skipped"; paymentId: string; reason: string };

/**
 * Roll a single RETURNED payment to the end of the schedule (idempotently):
 * mark the original REPLACED, append a fresh PENDING replacement for the
 * outstanding balance plus a separate late-fee charge, and notify the
 * borrower. At MAX_ROLLS the advance escalates to Collections instead.
 *
 * Caller is responsible for refreshing the application status afterward
 * (the payment-status cron does this for every dirty application).
 */
export async function rollOneReturnedPayment(paymentId: string): Promise<RollOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      application: {
        select: {
          id: true,
          status: true,
          paymentFrequency: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          applicationCode: true,
        },
      },
    },
  });
  if (!payment) return { status: "skipped", paymentId, reason: "not found" };

  // Idempotency + guardrails: only a genuinely returned, non-late-fee payment
  // on an active advance is rolled.
  if (payment.status !== "RETURNED") return { status: "skipped", paymentId, reason: `status ${payment.status}` };
  if (payment.isLateFee) return { status: "skipped", paymentId, reason: "late-fee charge" };
  const app = payment.application;
  if (NON_ROLLABLE_APP_STATUSES.includes(app.status)) {
    return { status: "skipped", paymentId, reason: `app ${app.status}` };
  }

  const rules = await getLoanRules();
  const lateFeeAmount = parseFloat(rules.late_fee_amount || "25");

  const allPayments = await prisma.payment.findMany({
    where: { applicationId: app.id },
    select: { paymentNumber: true, dueDate: true },
  });

  const plan = computeRollPlan({
    failed: {
      id: payment.id,
      amount: Number(payment.amount),
      principal: Number(payment.principal),
      interest: Number(payment.interest),
      collectedAmount: Number(payment.collectedAmount),
      rollCount: payment.rollCount,
      isLateFee: payment.isLateFee,
    },
    allPayments,
    frequency: (app.paymentFrequency as Frequency) || "WEEKLY",
    lateFeeAmount,
    maxRolls: MAX_ROLLS,
  });

  if (plan.action === "skip") {
    return { status: "skipped", paymentId, reason: plan.reason };
  }

  if (plan.action === "collections") {
    await prisma.application.update({ where: { id: app.id }, data: { status: "COLLECTIONS" } });
    await prisma.auditLog
      .create({
        data: {
          action: "PAYMENT_ROLL_TO_COLLECTIONS",
          entityType: "APPLICATION",
          entityId: app.id,
          performedBy: "system",
          details: JSON.stringify({ paymentId, rollCount: payment.rollCount, reason: plan.reason }),
        },
      })
      .catch(() => {});
    return { status: "collections", paymentId };
  }

  const { replacement, lateFee } = plan;

  const [, replacementRow, lateFeeRow] = await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "REPLACED" } }),
    prisma.payment.create({
      data: {
        applicationId: app.id,
        amount: replacement.amount,
        principal: replacement.principal,
        interest: replacement.interest,
        dueDate: replacement.dueDate,
        status: "PENDING",
        paymentNumber: replacement.paymentNumber,
        rollCount: replacement.rollCount,
        rolledFromPaymentId: replacement.rolledFromPaymentId,
      },
    }),
    ...(lateFee
      ? [
          prisma.payment.create({
            data: {
              applicationId: app.id,
              amount: lateFee.amount,
              principal: 0,
              interest: 0,
              dueDate: lateFee.dueDate,
              status: "PENDING",
              paymentNumber: lateFee.paymentNumber,
              isLateFee: true,
              rolledFromPaymentId: lateFee.rolledFromPaymentId,
            },
          }),
        ]
      : []),
  ]);

  // The borrower's very next real (non-late-fee) debit — what we tell them to
  // fund. Prefer the soonest upcoming PENDING payment.
  const nextUpcoming = await prisma.payment.findFirst({
    where: { applicationId: app.id, status: "PENDING", isLateFee: false, dueDate: { gte: new Date() } },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true, amount: true },
  });

  const contact = await prisma.contact.findFirst({
    where: { applicationId: app.id },
    select: { id: true },
  });

  try {
    await sendEmail({
      to: app.email,
      ...paymentRolledEmail({
        firstName: app.firstName,
        applicationCode: app.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        lateFeeAmount,
        nextDueDate: nextUpcoming?.dueDate ?? null,
        nextAmount: nextUpcoming ? Number(nextUpcoming.amount) : null,
      }),
      contactId: contact?.id,
      templateId: "payment-rolled",
    });
  } catch (err) {
    console.error(`[nsf-roll] email failed for ${paymentId}:`, err);
  }
  try {
    await sendSms({
      to: app.phone,
      body: paymentRolledSms({
        firstName: app.firstName,
        amount: Number(payment.amount),
        lateFeeAmount,
        nextDueDate: nextUpcoming?.dueDate ?? null,
        nextAmount: nextUpcoming ? Number(nextUpcoming.amount) : null,
      }),
      contactId: contact?.id,
    });
  } catch (err) {
    console.error(`[nsf-roll] sms failed for ${paymentId}:`, err);
  }

  await prisma.auditLog
    .create({
      data: {
        action: "PAYMENT_ROLLED_TO_END",
        entityType: "APPLICATION",
        entityId: app.id,
        performedBy: "system",
        details: JSON.stringify({
          failedPaymentId: paymentId,
          replacementPaymentId: replacementRow.id,
          lateFeePaymentId: lateFeeRow?.id ?? null,
          rollCount: replacement.rollCount,
        }),
      },
    })
    .catch(() => {});

  return {
    status: "rolled",
    paymentId,
    replacementId: replacementRow.id,
    lateFeeId: lateFeeRow?.id ?? null,
  };
}

/**
 * Find every RETURNED, non-late-fee payment that hasn't been rolled yet and
 * roll it. Idempotent: once rolled a payment becomes REPLACED so it won't be
 * picked up again. Returns the affected application ids so the caller can
 * refresh their status.
 */
export async function sweepNsfRolls(limit = 100): Promise<{ rolled: number; collections: number; appIds: string[] }> {
  // Only roll recent misses. This bounds the blast radius so the first run
  // after deploy doesn't retroactively roll (and late-fee + text) ancient
  // RETURNED rows. A genuine NSF is always on a current, near-due payment.
  const RECENT_DAYS = 45;
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000);
  const returned = await prisma.payment.findMany({
    where: { status: "RETURNED", isLateFee: false, dueDate: { gte: cutoff } },
    select: { id: true, applicationId: true },
    take: limit,
  });

  let rolled = 0;
  let collections = 0;
  const appIds = new Set<string>();
  for (const p of returned) {
    try {
      const outcome = await rollOneReturnedPayment(p.id);
      if (outcome.status === "rolled") {
        rolled++;
        appIds.add(p.applicationId);
      } else if (outcome.status === "collections") {
        collections++;
        appIds.add(p.applicationId);
      }
    } catch (err) {
      console.error(`[nsf-roll] sweep failed for ${p.id}:`, err);
    }
  }
  return { rolled, collections, appIds: [...appIds] };
}

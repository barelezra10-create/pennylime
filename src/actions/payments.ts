"use server";

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { selectMissedPayments } from "@/lib/missed-payments";

export async function getPaymentsByApplicationId(applicationId: string) {
  return prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
  });
}

export async function getPaymentsSummary(applicationId: string) {
  const payments = await prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
    include: {
      attempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  // WAIVED / CANCELED / RETURNED rows shouldn't count as "owed" — they
  // represent payments that were collapsed into a payoff or returned to
  // the customer. Otherwise post-payoff customers still see a balance.
  const obligatedPayments = payments.filter(
    (p) => p.status !== "WAIVED" && p.status !== "CANCELED" && p.status !== "RETURNED",
  );
  const totalOwed = obligatedPayments.reduce((s, p) => s + Number(p.amount), 0);
  // Sum collectedAmount across ALL obligated payments so partial
  // micro-collections show up in totals even on rows that aren't
  // fully PAID yet. For fully-paid rows collectedAmount == amount,
  // so this still adds up correctly.
  const totalPaid = obligatedPayments.reduce(
    (s, p) => s + Math.max(Number(p.collectedAmount ?? 0), p.status === "PAID" ? Number(p.amount) : 0),
    0,
  );
  const totalLateFees = obligatedPayments.reduce((s, p) => s + Number(p.lateFee), 0);
  const nextPayment = payments.find(
    (p) => p.status === "PENDING" || p.status === "FAILED"
  );
  const remainingBalance = Math.max(totalOwed - totalPaid, 0);

  return {
    payments,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalLateFees: Math.round(totalLateFees * 100) / 100,
    remainingBalance: Math.round(remainingBalance * 100) / 100,
    nextPayment,
  };
}

export async function retryPayment(paymentId: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  // Recharge covers any non-paid state where pulling again makes sense:
  // a failed ACH, an NSF return, a missed-cron LATE flag, or a PENDING
  // row whose due date has already passed (so the borrower is overdue
  // but we never attempted the debit yet).
  const overduePending =
    payment.status === "PENDING" && payment.dueDate && payment.dueDate.getTime() < Date.now();
  const retriable =
    payment.status === "FAILED" ||
    payment.status === "LATE" ||
    payment.status === "RETURNED" ||
    payment.status === "COLLECTIONS" ||
    overduePending;
  if (!retriable) {
    return { success: false, error: `Payment is ${payment.status} and not overdue, nothing to recharge.` };
  }

  // Mark as PROCESSING so cron doesn't double-debit
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "PROCESSING",
      retryCount: { increment: 1 },
      lastRetryAt: new Date(),
    },
  });

  // Initiate the ACH debit
  const { initiateACHDebit } = await import("@/lib/plaid-transfer");
  const result = await initiateACHDebit(paymentId);

  if (result.success) {
    const { applyDebitInitiation } = await import("@/lib/debit-writeback");
    await applyDebitInitiation(paymentId, result.transferId);
    const { recordAttemptStart } = await import("@/lib/payment-attempts");
    await recordAttemptStart({
      paymentId,
      initiatedBy: `admin:${auth.email}`,
      amount: Number(payment.amount) + Number(payment.lateFee),
      transferId: result.transferId,
    });
  } else {
    // Revert to FAILED if ACH initiation fails
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED" },
    });
    return { success: false, error: result.error };
  }

  await logAudit({
    action: "RETRY_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: auth.email,
    details: { applicationId: payment.applicationId, paymentNumber: payment.paymentNumber },
  });

  return { success: true };
}

/**
 * Admin-triggered ACH debit for a PENDING payment, ahead of its
 * scheduled cron run. Same code path the daily cron uses — locks the
 * row to PROCESSING first so the cron doesn't double-debit, calls
 * Increase, then updates the row with the transfer id. Used by the
 * "Charge now" button on the application detail page.
 */
export async function chargePaymentNow(paymentId: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { success: false, error: "Payment not found" };
  if (payment.status !== "PENDING") {
    return { success: false, error: `Payment is ${payment.status}, can only charge PENDING` };
  }

  // Lock to PROCESSING first so the daily cron can't double-debit.
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PROCESSING" },
  });

  const { initiateACHDebit } = await import("@/lib/plaid-transfer");
  const result = await initiateACHDebit(paymentId);

  if (!result.success) {
    // Roll back to PENDING so cron can retry, or admin can hit the
    // button again after fixing whatever was wrong.
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "PENDING" },
    });
    return { success: false, error: result.error };
  }

  const { applyDebitInitiation } = await import("@/lib/debit-writeback");
  await applyDebitInitiation(paymentId, result.transferId);

  const { recordAttemptStart } = await import("@/lib/payment-attempts");
  await recordAttemptStart({
    paymentId,
    initiatedBy: `admin:${auth.email}`,
    amount: Number(payment.amount) + Number(payment.lateFee),
    transferId: result.transferId,
  });

  await logAudit({
    action: "MANUAL_CHARGE_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: auth.email,
    details: { applicationId: payment.applicationId, paymentNumber: payment.paymentNumber, transferId: result.transferId },
  });

  return { success: true, transferId: result.transferId };
}

/**
 * Micro-collection: ACH-debit a custom amount (less than the
 * scheduled) against a single Payment. The amount is recorded on
 * a PaymentAttempt row and, when the debit settles, increments
 * Payment.collectedAmount. The row stays open until collectedAmount
 * >= amount, at which point the cascade flips it to PAID.
 *
 * Use when a borrower can't cover the full weekly debit but agrees
 * to a smaller pull. Avoids returning the whole amount and burning
 * an R01 / R09 NSF code on the file.
 */
export async function chargePartialPayment(paymentId: string, amount: number) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }
  if (amount > 100_000) {
    return { success: false, error: "Amount exceeds per-debit cap" };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!payment) return { success: false, error: "Payment not found" };

  // Guard: don't double-charge while another debit is in flight on
  // the same Payment. Same guard the early-payoff path uses.
  if (payment.status === "PROCESSING") {
    return { success: false, error: "Another debit is already processing for this payment" };
  }

  const outstanding =
    Math.max(0, Number(payment.amount) - Number(payment.collectedAmount)) +
    Number(payment.lateFee);
  if (amount > outstanding + 0.01) {
    return {
      success: false,
      error: `Amount exceeds outstanding ($${outstanding.toFixed(2)})`,
    };
  }

  // Lock to PROCESSING so concurrent admin clicks can't double-debit.
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PROCESSING" },
  });

  const { getPaymentProcessor } = await import("@/lib/payment-processor");
  if ((await getPaymentProcessor()) === "goach") {
    const { goachConfigured, createTransaction } = await import("@/lib/goach");
    if (!goachConfigured()) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "PENDING" } });
      return { success: false, error: "GoACH not configured" };
    }
    const { ensureGoachBankAccount } = await import("@/lib/goach-provision");
    const prov = await ensureGoachBankAccount(payment.application.id);
    if (!prov.ok) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "PENDING" } });
      return { success: false, error: prov.error };
    }
    const tx = await createTransaction({ bankAccountUuid: prov.bankAccountUuid, amountCents: Math.round(amount * 100), type: "Debit", descriptor: "PENNYLIME COLLECT" });
    if (!tx.ok) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "PENDING" } });
      return { success: false, error: tx.error };
    }
    await prisma.payment.update({
      where: { id: paymentId },
      data: { processor: "goach", achTransferId: tx.uuid, increaseTransferId: tx.uuid, increaseTransferStatus: "pending_submission", goachTransactionUuid: tx.uuid },
    });
    const { recordAttemptStart } = await import("@/lib/payment-attempts");
    await recordAttemptStart({ paymentId, initiatedBy: `admin:${auth.email}`, amount, transferId: tx.uuid });
    await logAudit({ action: "MANUAL_CHARGE_PAYMENT", entityType: "PAYMENT", entityId: paymentId, performedBy: auth.email, details: { kind: "MICRO_COLLECTION", amount, paymentNumber: payment.paymentNumber, transferId: tx.uuid, processor: "goach" } });
    return { success: true, transferId: tx.uuid };
  }

  const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
  const ext = await ensureIncreaseExternalAccount(payment.application.id);
  if (!ext.ok) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "PENDING" },
    });
    return { success: false, error: ext.error };
  }

  const { safeDebit } = await import("@/lib/increase");
  const result = await safeDebit({
    externalAccountId: ext.externalAccountId,
    amountCents: Math.round(amount * 100),
    statementDescriptor: "PENNYLIME COLLECT",
    individualName: `${payment.application.firstName} ${payment.application.lastName}`.slice(0, 22),
  });
  if (!result.ok) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "PENDING" },
    });
    return { success: false, error: result.error };
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      achTransferId: result.transferId,
      increaseTransferId: result.transferId,
      increaseTransferStatus: "pending_submission",
    },
  });

  const { recordAttemptStart } = await import("@/lib/payment-attempts");
  await recordAttemptStart({
    paymentId,
    initiatedBy: `admin:${auth.email}`,
    amount,
    transferId: result.transferId,
  });

  await logAudit({
    action: "MANUAL_CHARGE_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: auth.email,
    details: {
      kind: "MICRO_COLLECTION",
      amount,
      paymentNumber: payment.paymentNumber,
      transferId: result.transferId,
    },
  });

  return { success: true, transferId: result.transferId };
}

export async function waiveLateFee(paymentId: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (Number(payment.lateFee) === 0) {
    return { success: false, error: "No late fee to waive" };
  }

  const waivedAmount = Number(payment.lateFee);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { lateFee: 0 },
  });

  await logAudit({
    action: "WAIVE_FEE",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: auth.email,
    details: { waivedAmount, applicationId: payment.applicationId },
  });

  return { success: true, waivedAmount };
}

/**
 * Send the borrower a friendly "we missed your remittance, tell us when
 * to retry" email. Used by admin when a payment is overdue/failed and
 * we want the borrower to pick a recharge date instead of auto-retrying.
 */
export async function sendMissedPaymentNotice(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });
  if (!payment) return { success: false, error: "Payment not found" };

  const { sendEmail } = await import("@/lib/emails/send");
  const { missedPaymentEmail } = await import("@/lib/emails/missed-payment");

  const contact = await prisma.contact.findFirst({
    where: { applicationId: payment.applicationId },
    select: { id: true },
  });

  try {
    await sendEmail({
      to: payment.application.email,
      ...missedPaymentEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount) + Number(payment.lateFee),
        dueDate: payment.dueDate,
      }),
      contactId: contact?.id,
      templateId: "payment-missed-notice",
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }

  await logAudit({
    action: "COLLECTIONS_ESCALATION",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: {
      kind: "missed_payment_notice",
      applicationId: payment.applicationId,
      paymentNumber: payment.paymentNumber,
      amount: Number(payment.amount) + Number(payment.lateFee),
    },
  });

  return { success: true };
}

export async function getAllPayments(status?: string) {
  const where = status && status !== "ALL" ? { status } : {};
  return prisma.payment.findMany({
    where,
    include: {
      application: {
        select: {
          firstName: true,
          lastName: true,
          applicationCode: true,
          email: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
}

// --- Dialer workspace: balance + missed payments for a contact --------------

export async function getContactMoney(contactId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { email: true, applicationId: true },
  });
  if (!contact) return null;

  // Resolve the primary advance the same way getContact does: linked app,
  // plus any application matching by ssnHash or email, FUNDED/LATE first.
  const linkedApp = contact.applicationId
    ? await prisma.application.findUnique({ where: { id: contact.applicationId }, select: { id: true, ssnHash: true } })
    : null;
  const orClauses: Array<Record<string, unknown>> = [];
  if (linkedApp?.ssnHash) orClauses.push({ ssnHash: linkedApp.ssnHash });
  if (contact.email) orClauses.push({ email: { equals: contact.email, mode: "insensitive" as const } });
  if (linkedApp) orClauses.push({ id: linkedApp.id });
  const apps = orClauses.length
    ? await prisma.application.findMany({
        where: { OR: orClauses },
        select: { id: true, applicationCode: true, status: true, createdAt: true },
      })
    : [];
  const STATUS_PRIORITY = ["FUNDED", "LATE", "REPAYING", "ACTIVE", "COLLECTIONS", "APPROVED", "ACCEPTED", "PAID_OFF", "DEFAULTED", "PENDING", "REJECTED"];
  const sorted = [...apps].sort((a, b) => {
    const ai = STATUS_PRIORITY.indexOf(a.status);
    const bi = STATUS_PRIORITY.indexOf(b.status);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const primary = sorted[0];
  if (!primary) return null;

  // Only advances that actually have money movement are useful on a call.
  const ACTIVE = ["FUNDED", "ACTIVE", "REPAYING", "LATE", "PAID_OFF", "DEFAULTED", "COLLECTIONS"];
  if (!ACTIVE.includes(primary.status)) return null;

  const summary = await getPaymentsSummary(primary.id);
  const missed = selectMissedPayments(
    summary.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      amount: Number(p.amount),
      lateFee: Number(p.lateFee),
      collectedAmount: Number(p.collectedAmount ?? 0),
      dueDate: p.dueDate,
      status: p.status,
      increaseReturnReason: p.increaseReturnReason ?? null,
    })),
    new Date()
  );

  const paidCount = summary.payments.filter((p) => p.status === "PAID").length;
  const next = summary.nextPayment;

  return {
    applicationId: primary.id,
    applicationCode: primary.applicationCode,
    status: primary.status,
    remainingBalance: summary.remainingBalance,
    totalOwed: summary.totalOwed,
    totalPaid: summary.totalPaid,
    totalLateFees: summary.totalLateFees,
    paidCount,
    totalCount: summary.payments.length,
    nextDue: next
      ? {
          paymentId: next.id,
          amount: Number(next.amount),
          lateFee: Number(next.lateFee),
          dueDate: next.dueDate.toISOString(),
          status: next.status,
        }
      : null,
    missed: missed.map((m) => ({ ...m, dueDate: m.dueDate.toISOString() })),
  };
}

"use server";

import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { logAudit } from "@/lib/audit";

/**
 * "Skip one payment" feature for the customer portal.
 *
 * Mechanics:
 *   - Customer can defer their NEXT pending weekly payment to the end
 *     of the schedule. Other pending payments keep their due dates.
 *   - Cost = 5% of the original advance amount (e.g. $125 on a $2,500).
 *     Charged immediately as a separate Increase ACH debit, distinct
 *     from the weekly schedule.
 *   - Capped at 1 skip per advance for now (anti-abuse).
 */

const SKIP_FEE_RATE = 0.05;
const MAX_SKIPS = 1;
// Borrower must have paid this fraction of (principal + interest) before
// the skip option unlocks. Mirrors the top-up eligibility threshold so
// the two "earned" features have the same gating story for customers.
const SKIP_ELIGIBILITY_PAID_RATIO = 0.5;

type SkipQuoteOk = {
  ok: true;
  feeAmount: number;
  skippedPaymentId: string;
  skippedPaymentNumber: number;
  skippedDueDate: string;
  skippedAmount: number;
  newDueDate: string;
  skipsUsed: number;
  maxSkips: number;
};
type SkipQuoteErr = {
  ok: false;
  error: string;
  // Surface eligibility progress on "not yet" rejections so the UI can
  // render a "you need X% more paid" hint rather than a flat error.
  paidRatio?: number;
  thresholdRatio?: number;
};
export type SkipQuote = SkipQuoteOk | SkipQuoteErr;

export async function getSkipQuote(): Promise<SkipQuote> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };
  return computeSkipQuote(applicationId);
}

async function computeSkipQuote(applicationId: string): Promise<SkipQuote> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      fundedAmount: true,
      loanAmount: true,
      skipsUsed: true,
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          lateFee: true,
          dueDate: true,
          paidAt: true,
          status: true,
        },
      },
    },
  });
  if (!app) return { ok: false, error: "Application not found" };

  if (app.skipsUsed >= MAX_SKIPS) {
    return { ok: false, error: "You've already used your one skip on this advance." };
  }

  const nextPending = app.payments.find(
    (p) => p.status !== "PAID" && p.status !== "WAIVED" && !p.paidAt,
  );
  if (!nextPending) {
    return { ok: false, error: "Nothing left to skip." };
  }

  // 50%-paid gate. Skip is an "earned" benefit - we don't want a borrower
  // to skip their FIRST payment, take the cash and disappear. WAIVED /
  // CANCELED / RETURNED rows excluded from the denominator (same as
  // top-up eligibility) so a prior skip doesn't lower this ratio.
  const obligated = app.payments.filter(
    (p) => p.status !== "WAIVED" && p.status !== "CANCELED" && p.status !== "RETURNED",
  );
  const totalRepay = obligated.reduce(
    (s, p) => s + Number(p.amount) + Number(p.lateFee),
    0,
  );
  const paidAmount = app.payments
    .filter((p) => p.status === "PAID" || p.paidAt)
    .reduce((s, p) => s + Number(p.amount), 0);
  const paidRatio = totalRepay > 0 ? paidAmount / totalRepay : 0;

  if (paidRatio < SKIP_ELIGIBILITY_PAID_RATIO) {
    return {
      ok: false,
      error: `Skip unlocks after you've paid 50% of your advance. You're at ${Math.round(paidRatio * 100)}%.`,
      paidRatio: Math.round(paidRatio * 1000) / 1000,
      thresholdRatio: SKIP_ELIGIBILITY_PAID_RATIO,
    };
  }

  const principal = Number(app.fundedAmount ?? app.loanAmount);
  const feeAmount = Math.round(principal * SKIP_FEE_RATE * 100) / 100;

  // New due date for the skipped payment = (max existing dueDate) + 7 days.
  // Pushes the skipped payment to the END of the schedule, extending the
  // term by one week.
  const maxDue = app.payments.reduce(
    (max, p) => Math.max(max, new Date(p.dueDate).getTime()),
    0,
  );
  const newDueDate = new Date(maxDue + 7 * 24 * 60 * 60 * 1000);

  return {
    ok: true,
    feeAmount,
    skippedPaymentId: nextPending.id,
    skippedPaymentNumber: nextPending.paymentNumber,
    skippedDueDate: nextPending.dueDate.toISOString(),
    skippedAmount: Number(nextPending.amount),
    newDueDate: newDueDate.toISOString(),
    skipsUsed: app.skipsUsed,
    maxSkips: MAX_SKIPS,
  };
}

/**
 * Execute the skip:
 *   1. Initiate Increase ACH debit for the 5% fee
 *   2. Push the next pending payment's dueDate to (max dueDate) + 7 days
 *   3. Create a separate Payment row for the fee (status PROCESSING)
 *   4. Increment Application.skipsUsed
 *   5. Audit log
 */
export async function executeSkip(): Promise<
  { ok: true; feeAmount: number; newDueDate: string; transferId: string } | { ok: false; error: string }
> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };

  // Guard against concurrent payoff + skip (or double-click). If any
  // Payment row is already PROCESSING we have an in-flight ACH debit.
  const inflight = await prisma.payment.findFirst({
    where: { applicationId, status: "PROCESSING" },
    select: { id: true },
  });
  if (inflight) {
    return { ok: false, error: "Another payment is already processing. Try again in a few minutes." };
  }

  const quote = await computeSkipQuote(applicationId);
  if (!quote.ok) return { ok: false, error: quote.error };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      plaidAccessToken: true,
      payments: { orderBy: { paymentNumber: "asc" } },
    },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (!app.plaidAccessToken) {
    return { ok: false, error: "No bank account linked to charge the fee." };
  }

  const { goachProductionReady } = await import("@/lib/payment-processor");
  if (!goachProductionReady()) return { ok: false, error: "GoACH production not configured" };

  const { createTransaction } = await import("@/lib/goach");
  const { ensureGoachBankAccount } = await import("@/lib/goach-provision");

  const prov = await ensureGoachBankAccount(app.id);
  if (!prov.ok) return { ok: false, error: prov.error };

  const tx = await createTransaction({
    bankAccountUuid: prov.bankAccountUuid,
    amountCents: Math.round(quote.feeAmount * 100),
    type: "Debit",
    descriptor: "PENNYLIME SKIP",
  });
  if (!tx.ok) return { ok: false, error: tx.error };

  const transferId = tx.uuid;
  const nextPaymentNumber = (app.payments[app.payments.length - 1]?.paymentNumber || 0) + 1;

  await prisma.$transaction([
    // Push the skipped payment to the end of the schedule.
    prisma.payment.update({
      where: { id: quote.skippedPaymentId },
      data: { dueDate: new Date(quote.newDueDate) },
    }),
    // Record the fee debit as its own Payment row so it appears in the
    // schedule + repayment ledgers. principal/interest both 0 - the whole
    // amount is the late-style skip fee.
    prisma.payment.create({
      data: {
        applicationId: app.id,
        amount: quote.feeAmount,
        principal: 0,
        interest: 0,
        lateFee: quote.feeAmount,
        dueDate: new Date(),
        paymentNumber: nextPaymentNumber,
        status: "PROCESSING",
        increaseTransferId: transferId,
        increaseTransferStatus: "pending_submission",
        goachTransactionUuid: transferId,
        processor: "goach",
      },
    }),
    prisma.application.update({
      where: { id: app.id },
      data: { skipsUsed: { increment: 1 } },
    }),
  ]);

  await logAudit({
    action: "MANUAL_CHARGE_PAYMENT",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: `portal:${app.firstName} ${app.lastName}`,
    details: {
      kind: "SKIP_PAYMENT",
      feeAmount: quote.feeAmount,
      skippedPaymentNumber: quote.skippedPaymentNumber,
      skippedAmount: quote.skippedAmount,
      newDueDate: quote.newDueDate,
      transferId,
    },
  });

  return { ok: true, feeAmount: quote.feeAmount, newDueDate: quote.newDueDate, transferId };
}

"use server";

import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { logAudit } from "@/lib/audit";

/**
 * Early payoff math.
 *
 * Pricing model is 5% weekly compounded over 8 weeks. Each scheduled
 * payment carries a declining-principal split (principal + interest).
 * The borrower has already paid interest for the time the money was
 * outstanding via the interest portions of paid weekly payments.
 *
 * Early payoff = current outstanding principal
 *              + interest accrued since the last paid payment (pro-rated
 *                to today, on the still-outstanding principal)
 *
 * Savings vs. running the schedule to completion = sum of UNPAID interest
 * portions minus the pro-rated accrued interest above.
 */

const WEEKLY_RATE = 0.05;

type PayoffQuoteOk = {
  ok: true;
  outstandingPrincipal: number;
  accruedInterestSinceLastPayment: number;
  payoffAmount: number;
  scheduledRemaining: number;
  savings: number;
  weeksSinceAnchor: number;
};
type PayoffQuoteErr = { ok: false; error: string };
export type PayoffQuote = PayoffQuoteOk | PayoffQuoteErr;

export async function getPayoffQuote(): Promise<PayoffQuote> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };
  return computeQuote(applicationId);
}

async function computeQuote(applicationId: string): Promise<PayoffQuote> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      fundedAt: true,
      fundedAmount: true,
      loanAmount: true,
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          amount: true,
          principal: true,
          interest: true,
          lateFee: true,
          dueDate: true,
          paidAt: true,
          status: true,
        },
      },
    },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const allPaid = app.payments.every((p) => p.status === "PAID" || p.paidAt);
  if (allPaid || app.status === "PAID_OFF") {
    return { ok: false, error: "Advance is already paid off." };
  }
  if (app.payments.length === 0) {
    return { ok: false, error: "No payment schedule on file." };
  }

  // Sum the principal portions of UNPAID payments. That's what the borrower
  // still owes in principal terms — independent of when they pay it off.
  let outstandingPrincipal = 0;
  let scheduledUnpaidInterest = 0;
  let scheduledUnpaidTotal = 0;
  for (const p of app.payments) {
    const isPaid = p.status === "PAID" || !!p.paidAt;
    if (isPaid) continue;
    outstandingPrincipal += Number(p.principal);
    scheduledUnpaidInterest += Number(p.interest);
    scheduledUnpaidTotal += Number(p.amount) + Number(p.lateFee);
  }

  if (outstandingPrincipal <= 0) {
    return { ok: false, error: "No outstanding principal." };
  }

  // Anchor for accrued-interest calc: most recent paid payment, or the
  // disbursement date if none have been paid yet. We charge weekly-compounded
  // interest on the outstanding principal from anchor -> now, pro-rated
  // by fractional weeks.
  const paidPayments = app.payments
    .filter((p) => p.status === "PAID" || p.paidAt)
    .sort((a, b) => {
      const ad = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bd = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return bd - ad;
    });
  const lastPaidAt = paidPayments[0]?.paidAt
    ? new Date(paidPayments[0].paidAt as Date)
    : app.fundedAt
      ? new Date(app.fundedAt)
      : null;
  if (!lastPaidAt) {
    return { ok: false, error: "Cannot determine accrual start date." };
  }

  const now = Date.now();
  const msSinceAnchor = Math.max(0, now - lastPaidAt.getTime());
  const weeksSinceAnchor = msSinceAnchor / (7 * 24 * 60 * 60 * 1000);

  // Compound at 5%/week, pro-rated for fractional week:
  //   accrued = outstanding × ((1 + r)^weeks - 1)
  const accruedInterestSinceLastPayment = Math.max(
    0,
    outstandingPrincipal * (Math.pow(1 + WEEKLY_RATE, weeksSinceAnchor) - 1),
  );

  const payoffAmount =
    Math.round((outstandingPrincipal + accruedInterestSinceLastPayment) * 100) / 100;
  const savings =
    Math.round((scheduledUnpaidTotal - payoffAmount) * 100) / 100;

  return {
    ok: true,
    outstandingPrincipal: Math.round(outstandingPrincipal * 100) / 100,
    accruedInterestSinceLastPayment: Math.round(accruedInterestSinceLastPayment * 100) / 100,
    payoffAmount,
    scheduledRemaining: Math.round(scheduledUnpaidTotal * 100) / 100,
    savings: savings > 0 ? savings : 0,
    weeksSinceAnchor: Math.round(weeksSinceAnchor * 100) / 100,
  };
}

/**
 * Executes an early payoff:
 *   1. Re-compute the quote (no client-side trust)
 *   2. Initiate a single Increase ACH debit for the payoff amount
 *   3. Mark all unpaid Payments as WAIVED with a payoff note
 *   4. Add a new Payment row representing the payoff itself (PROCESSING)
 *   5. Flip Application.status to PAID_OFF once the transfer posts
 *      (handled by the existing webhook + payment-status cron)
 */
export async function executePayoff(): Promise<
  { ok: true; payoffAmount: number; transferId: string } | { ok: false; error: string }
> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };

  // Guard against concurrent skip + payoff (or double-clicks). If any
  // Payment row for this application is already PROCESSING we have an
  // in-flight ACH debit and a second one would double-charge.
  const inflight = await prisma.payment.findFirst({
    where: { applicationId, status: "PROCESSING" },
    select: { id: true },
  });
  if (inflight) {
    return { ok: false, error: "Another payment is already processing. Try again in a few minutes." };
  }

  const quote = await computeQuote(applicationId);
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
    return { ok: false, error: "No bank account linked to charge." };
  }

  // Resolve the Increase external account (reuses existing ACH auth scope)
  const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
  const ext = await ensureIncreaseExternalAccount(app.id);
  if (!ext.ok) return { ok: false, error: ext.error };

  const { createAchDebit } = await import("@/lib/increase");
  const result = await createAchDebit({
    externalAccountId: ext.externalAccountId,
    amountCents: Math.round(quote.payoffAmount * 100),
    statementDescriptor: "PENNYLIME PAYOFF",
    individualName: `${app.firstName} ${app.lastName}`.slice(0, 22),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const transferId = result.data.id;
  const nextPaymentNumber = (app.payments[app.payments.length - 1]?.paymentNumber || 0) + 1;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mark all unpaid scheduled payments as WAIVED — they're being collapsed
    // into the single payoff debit and the customer is no longer on the hook
    // for the remaining schedule.
    await tx.payment.updateMany({
      where: {
        applicationId: app.id,
        status: { notIn: ["PAID"] },
        paidAt: null,
      },
      data: { status: "WAIVED" },
    });
    // Create the payoff Payment row. The interest portion is the accrued
    // interest computed above; everything else is principal.
    await tx.payment.create({
      data: {
        applicationId: app.id,
        amount: quote.payoffAmount,
        principal: quote.outstandingPrincipal,
        interest: quote.accruedInterestSinceLastPayment,
        lateFee: 0,
        dueDate: now,
        paymentNumber: nextPaymentNumber,
        status: "PROCESSING",
        increaseTransferId: transferId,
        increaseTransferStatus: "pending_submission",
      },
    });
  });

  await logAudit({
    action: "MANUAL_CHARGE_PAYMENT",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: `portal:${app.firstName} ${app.lastName}`,
    details: {
      kind: "EARLY_PAYOFF",
      payoffAmount: quote.payoffAmount,
      outstandingPrincipal: quote.outstandingPrincipal,
      accruedInterest: quote.accruedInterestSinceLastPayment,
      transferId,
    },
  });

  return { ok: true, payoffAmount: quote.payoffAmount, transferId };
}

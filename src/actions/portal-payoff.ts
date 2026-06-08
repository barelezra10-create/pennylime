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

  // Refuse to quote while a debit is still settling. Without this, a
  // borrower who already hit "Pay off now" sees a stale quote that
  // double-counts the in-flight payoff principal as still outstanding
  // and could click pay off again, double-charging themselves.
  const inflight = app.payments.some((p) => p.status === "PROCESSING");
  if (inflight) {
    return { ok: false, error: "A payment is currently processing. Once it settles, the dashboard will refresh." };
  }

  // Sum the principal portions of UNPAID, NON-WAIVED payments. WAIVED /
  // CANCELED / RETURNED rows have been collapsed into a prior payoff or
  // refunded and must never inflate the outstanding figure.
  let outstandingPrincipal = 0;
  let scheduledUnpaidInterest = 0;
  let scheduledUnpaidTotal = 0;
  for (const p of app.payments) {
    const isPaid = p.status === "PAID" || !!p.paidAt;
    if (isPaid) continue;
    if (p.status === "WAIVED" || p.status === "CANCELED" || p.status === "RETURNED") continue;
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
  // Sanity: a payment timestamp in the future (clock skew, manual DB
  // edit) would silently underquote the payoff because Math.max(0,...)
  // would zero out the accrued interest. Refuse to quote when we detect
  // this so the admin can investigate, rather than letting the borrower
  // pay off cheaper than they should.
  if (lastPaidAt.getTime() > now + 60 * 60 * 1000) {
    return { ok: false, error: "Payment timestamp is in the future. Please contact support." };
  }
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

  const { safeDebit } = await import("@/lib/increase");
  // safeDebit tries Same-Day first, falls back to standard ACH if past
  // the same-day cutoff or destination doesn't support it.
  const result = await safeDebit({
    externalAccountId: ext.externalAccountId,
    amountCents: Math.round(quote.payoffAmount * 100),
    statementDescriptor: "PENNYLIME PAYOFF",
    individualName: `${app.firstName} ${app.lastName}`.slice(0, 22),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const transferId = result.transferId;
  const now = new Date();
  // Repurpose the next unpaid payment as the payoff line rather than
  // creating a brand-new row + waiving the original. This keeps the
  // total payment count stable so the portal / admin view shows a
  // clean ledger (1 payoff + remaining waived) instead of N+1 rows
  // including an out-of-order extra entry.
  const nextUnpaid = app.payments.find(
    (p) => p.status !== "PAID" && !p.paidAt,
  );

  await prisma.$transaction(async (tx) => {
    // Mark every OTHER unpaid scheduled payment as WAIVED — they're
    // collapsed into the single payoff debit.
    await tx.payment.updateMany({
      where: {
        applicationId: app.id,
        status: { notIn: ["PAID"] },
        paidAt: null,
        ...(nextUnpaid ? { id: { not: nextUnpaid.id } } : {}),
      },
      data: { status: "WAIVED" },
    });

    if (nextUnpaid) {
      // Update the next-unpaid row to BE the payoff. Carries the new
      // amount, principal, interest, the ACH transfer id, and moves
      // status to PROCESSING.
      await tx.payment.update({
        where: { id: nextUnpaid.id },
        data: {
          amount: quote.payoffAmount,
          principal: quote.outstandingPrincipal,
          interest: quote.accruedInterestSinceLastPayment,
          lateFee: 0,
          dueDate: now,
          status: "PROCESSING",
          increaseTransferId: transferId,
          increaseTransferStatus: "pending_submission",
        },
      });
    } else {
      // No unpaid row exists (shouldn't happen since computeQuote
      // bailed earlier if balance is zero, but guard anyway). Create
      // one as the trailing slot.
      const nextPaymentNumber = (app.payments[app.payments.length - 1]?.paymentNumber || 0) + 1;
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
    }
  });

  // Record the payoff in the attempt history on whichever Payment
  // row was repurposed (or freshly created) above. Look up by the
  // transferId we just wrote.
  try {
    const target = await prisma.payment.findFirst({
      where: { applicationId: app.id, increaseTransferId: transferId },
      select: { id: true },
    });
    if (target) {
      const { recordAttemptStart } = await import("@/lib/payment-attempts");
      await recordAttemptStart({
        paymentId: target.id,
        initiatedBy: `portal:${app.firstName} ${app.lastName}`,
        amount: quote.payoffAmount,
        transferId,
      });
    }
  } catch (err) {
    console.error("[payoff] attempt-history record failed:", err);
  }

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

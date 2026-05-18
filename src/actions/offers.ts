"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function generateWeeklySchedule(input: {
  principal: number;
  weeklyPayment: number;
  termWeeks: number;
  startDate: Date;
  // When set (0=Sunday … 6=Saturday), the FIRST payment date snaps
  // to the next occurrence of this day-of-week, and every subsequent
  // payment is exactly 7 days later. Lets us land debits one day
  // after the borrower's typical paycheck day.
  preferredChargeDay?: number | null;
}) {
  const totalToRepay = input.weeklyPayment * input.termWeeks;
  const totalInterest = Math.max(0, totalToRepay - input.principal);
  const interestPerPayment = totalInterest / input.termWeeks;
  const principalPerPayment = input.weeklyPayment - interestPerPayment;

  // First-payment anchor: either today + 7 (legacy behavior) or the
  // next occurrence of preferredChargeDay AFTER today+7 so we never
  // pull money the same week the advance disburses.
  const firstDue = new Date(input.startDate);
  firstDue.setDate(firstDue.getDate() + 7);
  if (input.preferredChargeDay != null) {
    const targetDay = input.preferredChargeDay;
    const currentDay = firstDue.getDay();
    const diff = (targetDay - currentDay + 7) % 7;
    firstDue.setDate(firstDue.getDate() + diff);
  }

  const schedule: Array<{
    paymentNumber: number;
    dueDate: Date;
    amount: number;
    principal: number;
    interest: number;
  }> = [];
  for (let i = 0; i < input.termWeeks; i++) {
    const due = new Date(firstDue);
    due.setDate(due.getDate() + 7 * i);
    schedule.push({
      paymentNumber: i + 1,
      dueDate: due,
      amount: Math.round(input.weeklyPayment * 100) / 100,
      principal: Math.round(principalPerPayment * 100) / 100,
      interest: Math.round(interestPerPayment * 100) / 100,
    });
  }
  return schedule;
}

export type OfferTerm = {
  weeklyRemittance: number;
  durationWeeks: number;
  disbursedAmount: number;
  totalCostOfCapital: number;
  processingFee: number;
  isRecommended: boolean;
};

/**
 * Admin sets the approved range and 2-3 repayment plan options for an
 * application, generates a one-time offerToken, and marks the offer as
 * ready to send. The applicant later visits /offer/[code]?t=[token] to
 * pick within the range and accept.
 */
export async function setOfferTerms(input: {
  applicationId: string;
  offeredMinAmount: number;
  offeredMaxAmount: number;
  terms: OfferTerm[];
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  if (input.offeredMaxAmount < input.offeredMinAmount) {
    return { ok: false as const, error: "Max amount must be >= min amount" };
  }
  if (input.terms.length < 1 || input.terms.length > 3) {
    return { ok: false as const, error: "Provide 1-3 repayment plans" };
  }

  // Reuse existing token if already set; otherwise mint a fresh one.
  const existing = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { offerToken: true },
  });
  const offerToken = existing?.offerToken ?? randomBytes(24).toString("hex");

  await prisma.application.update({
    where: { id: input.applicationId },
    data: {
      offerStatus: "OFFERED",
      offeredMinAmount: input.offeredMinAmount,
      offeredMaxAmount: input.offeredMaxAmount,
      offeredTermsJson: JSON.stringify(input.terms),
      offerToken,
      offerSentAt: new Date(),
    },
  });

  await logAudit({
    action: "OFFER_SET",
    entityType: "APPLICATION",
    entityId: input.applicationId,
    performedBy: session.user.email,
    details: {
      min: input.offeredMinAmount,
      max: input.offeredMaxAmount,
      planCount: input.terms.length,
    },
  });

  return { ok: true as const, offerToken };
}

/**
 * Public endpoint used by the /offer/[code] page. Validates the
 * applicationCode + offer token combination and returns the offer view.
 */
export async function getOfferForApplicant(input: {
  applicationCode: string;
  token: string;
}) {
  const app = await prisma.application.findUnique({
    where: { applicationCode: input.applicationCode.toUpperCase() },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      offerStatus: true,
      offerToken: true,
      offeredMinAmount: true,
      offeredMaxAmount: true,
      offeredTermsJson: true,
      acceptedAmount: true,
      acceptedTermIndex: true,
      acceptedAt: true,
      preferredChargeDay: true,
      plaidAccountMask: true,
      plaidInstitutionName: true,
      bankName: true,
      bankAccountNumberManual: true,
    },
  });
  if (!app) return { ok: false as const, error: "Offer not found" };
  if (!app.offerToken || app.offerToken !== input.token) {
    return { ok: false as const, error: "Invalid or expired link" };
  }
  if (app.offerStatus === "PENDING") {
    return { ok: false as const, error: "No offer available yet" };
  }

  let terms: OfferTerm[] = [];
  try {
    terms = app.offeredTermsJson ? JSON.parse(app.offeredTermsJson) : [];
  } catch {
    return { ok: false as const, error: "Offer is corrupted" };
  }

  // Bank info to show on the ACH authorization. Prefer Plaid metadata
  // (came from the verified linked bank); fall back to admin-entered.
  const bankName = app.plaidInstitutionName ?? app.bankName ?? null;
  // bankAccountNumberManual is encrypted — only safe to surface last 4
  // and only when there's no Plaid mask; in practice we always have one
  // or the other.
  const bankAccountMask = app.plaidAccountMask ?? null;

  return {
    ok: true as const,
    firstName: app.firstName,
    lastName: app.lastName,
    status: app.offerStatus as "OFFERED" | "ACCEPTED" | "DECLINED",
    minAmount: app.offeredMinAmount ? Number(app.offeredMinAmount) : 0,
    maxAmount: app.offeredMaxAmount ? Number(app.offeredMaxAmount) : 0,
    terms,
    acceptedAmount: app.acceptedAmount ? Number(app.acceptedAmount) : null,
    acceptedTermIndex: app.acceptedTermIndex,
    acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
    preferredChargeDay: app.preferredChargeDay ?? null,
    bankName,
    bankAccountMask,
  };
}

/**
 * Applicant clicks "Accept" with their selected amount + term. We persist
 * the choice, generate a payment schedule, and trigger the existing
 * Increase ACH disbursement flow (already wired up in fundApplication).
 */
export async function acceptOffer(input: {
  applicationCode: string;
  token: string;
  selectedAmount: number;
  selectedTermIndex: number;
  // ACH authorization payload — captured at acceptance time so we have
  // an immutable record of what the borrower agreed to.
  authorizationText?: string;
  userAgent?: string;
  agreedToAgreement?: boolean;
  agreedToAch?: boolean;
}) {
  // Refuse if the new consent gate wasn't satisfied. Old clients that
  // don't pass the booleans (e.g. browser cached the older page)
  // still work — backward-compatible — but new clients must pass true.
  if (input.agreedToAgreement === false || input.agreedToAch === false) {
    return { ok: false as const, error: "You must agree to both the agreement and the ACH authorization to accept." };
  }
  const app = await prisma.application.findUnique({
    where: { applicationCode: input.applicationCode.toUpperCase() },
  });
  if (!app) return { ok: false as const, error: "Application not found" };
  if (!app.offerToken || app.offerToken !== input.token) {
    return { ok: false as const, error: "Invalid link" };
  }
  if (app.offerStatus === "ACCEPTED") {
    return { ok: false as const, error: "Offer already accepted" };
  }
  if (app.offerStatus !== "OFFERED") {
    return { ok: false as const, error: "Offer not available" };
  }

  const min = Number(app.offeredMinAmount ?? 0);
  const max = Number(app.offeredMaxAmount ?? 0);
  if (input.selectedAmount < min || input.selectedAmount > max) {
    return { ok: false as const, error: `Amount must be between $${min} and $${max}` };
  }

  let terms: OfferTerm[] = [];
  try {
    terms = app.offeredTermsJson ? JSON.parse(app.offeredTermsJson) : [];
  } catch {
    return { ok: false as const, error: "Offer is corrupted" };
  }
  const term = terms[input.selectedTermIndex];
  if (!term) return { ok: false as const, error: "Invalid plan selection" };

  // Persist the acceptance.
  await prisma.application.update({
    where: { id: app.id },
    data: {
      offerStatus: "ACCEPTED",
      acceptedAmount: input.selectedAmount,
      acceptedTermIndex: input.selectedTermIndex,
      acceptedAt: new Date(),
      // Mark the application as APPROVED so admin sees it move forward.
      status: "APPROVED",
      approvedAt: new Date(),
      fundedAmount: input.selectedAmount,
    },
  });

  // Build payment schedule from the selected term. Snap each weekly
  // due date to the borrower's preferredChargeDay if we computed one
  // from their bank deposit pattern — debit lands when balance is
  // freshest, lifting success rates.
  const schedule = generateWeeklySchedule({
    principal: input.selectedAmount,
    weeklyPayment: term.weeklyRemittance,
    termWeeks: term.durationWeeks,
    startDate: new Date(),
    preferredChargeDay: app.preferredChargeDay,
  });
  if (schedule.length > 0) {
    await prisma.payment.createMany({
      data: schedule.map((p) => ({
        applicationId: app.id,
        paymentNumber: p.paymentNumber,
        amount: p.amount,
        principal: p.principal,
        interest: p.interest,
        lateFee: 0,
        dueDate: p.dueDate,
        status: "SCHEDULED",
      })),
    });
  }

  // Immutable ACH authorization record — captures IP, UA, exact text
  // shown, and the schedule snapshot. Legal evidence for any future
  // dispute about whether the borrower agreed.
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const linkedContact = await prisma.contact.findFirst({
      where: { applicationId: app.id },
      select: { id: true },
    });
    const totalDebit = schedule.reduce((s, p) => s + p.amount, 0);
    await prisma.achAuthorization.create({
      data: {
        applicationId: app.id,
        contactId: linkedContact?.id ?? null,
        ipAddress,
        userAgent: input.userAgent ?? null,
        bankAccountMask: app.plaidAccountMask ?? app.bankAccountNumberManual?.slice(-4) ?? null,
        bankName: app.plaidInstitutionName ?? app.bankName ?? null,
        scheduleJson: JSON.stringify(
          schedule.map((p) => ({
            paymentNumber: p.paymentNumber,
            date: p.dueDate.toISOString().slice(0, 10),
            amount: p.amount,
            principal: p.principal,
            interest: p.interest,
          })),
        ),
        totalDebitAmount: totalDebit,
        authorizationText:
          input.authorizationText ??
          `I authorize PennyLime (770 Technology LLC) to ACH debit my linked bank account for ${schedule.length} weekly payments totaling $${totalDebit.toFixed(2)}, on the schedule above. This authorization remains in effect until the full amount has been delivered or I revoke in writing by emailing info@pennylime.com at least 3 business days before the next debit.`,
        agreementVersion: "v1-2026-05-17",
      },
    });
  } catch (err) {
    console.error("Failed to persist AchAuthorization:", err);
  }

  await logAudit({
    action: "OFFER_ACCEPTED",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: app.email,
    details: {
      amount: input.selectedAmount,
      termIndex: input.selectedTermIndex,
      durationWeeks: term.durationWeeks,
      weeklyRemittance: term.weeklyRemittance,
    },
  });

  // Best-effort ACH disbursement using existing Increase pipeline.
  // Failures here don't block acceptance — admin can retry from the detail page.
  try {
    if (process.env.INCREASE_API_KEY) {
      const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
      const { createAchCredit } = await import("@/lib/increase");
      const ext = await ensureIncreaseExternalAccount(app.id);
      if (ext.ok) {
        const transfer = await createAchCredit({
          externalAccountId: ext.externalAccountId,
          amountCents: Math.round(input.selectedAmount * 100),
          statementDescriptor: "PENNYLIME ADV",
          individualName: `${app.firstName} ${app.lastName}`.slice(0, 22),
        });
        if (transfer.ok) {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: "FUNDED",
              fundedAt: new Date(),
              increaseTransferId: transfer.data.id,
              increaseTransferStatus: transfer.data.status,
            },
          });
          // Move linked contact to FUNDED stage so the celebration email fires.
          const linkedContact = await prisma.contact.findFirst({
            where: { applicationId: app.id },
          });
          if (linkedContact) {
            const { updateContactStage } = await import("@/actions/contacts");
            updateContactStage(linkedContact.id, "FUNDED").catch((err) =>
              console.error("[email] funded stage update failed:", err),
            );
          }
        } else {
          await prisma.application.update({
            where: { id: app.id },
            data: { increaseDisburseError: transfer.error },
          });
        }
      } else {
        await prisma.application.update({
          where: { id: app.id },
          data: { increaseDisburseError: ext.error },
        });
      }
    }
  } catch (err) {
    console.error("Disbursement on accept failed:", err);
  }

  return { ok: true as const };
}

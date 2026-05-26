"use server";

import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { logAudit } from "@/lib/audit";

/**
 * "Request more advance" feature for the customer portal.
 *
 * Eligibility rule (per spec):
 *   - The borrower has paid at least 50% of (principal + interest).
 *   - They may request up to 2× the original advance amount.
 *
 * Submitting a request creates an AdvanceTopUpRequest row in PENDING
 * status. Admin reviews it in the CRM (it shows up as an activity +
 * tag on the contact). No new Application is created automatically -
 * admin can clone the existing application data when they approve.
 *
 * One outstanding PENDING request at a time per active advance.
 */

const ELIGIBILITY_PAID_RATIO = 0.5;
const MAX_MULTIPLIER = 2.0;

type EligibilityOk = {
  ok: true;
  eligible: boolean;
  originalAmount: number;
  totalRepay: number;
  paidAmount: number;
  paidRatio: number;
  thresholdRatio: number;
  maxRequestAmount: number;
  minRequestAmount: number;
  existingPending: { id: string; requestedAmount: number; createdAt: string } | null;
};
type EligibilityErr = { ok: false; error: string };
export type TopUpEligibility = EligibilityOk | EligibilityErr;

export async function getTopUpEligibility(): Promise<TopUpEligibility> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      fundedAmount: true,
      loanAmount: true,
      payments: {
        select: { amount: true, lateFee: true, principal: true, status: true, paidAt: true },
      },
    },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const originalAmount = Number(app.fundedAmount ?? app.loanAmount);
  const totalRepay = app.payments.reduce(
    (s, p) => s + Number(p.amount) + Number(p.lateFee),
    0,
  );
  const paidAmount = app.payments
    .filter((p) => p.status === "PAID" || p.paidAt)
    .reduce((s, p) => s + Number(p.amount), 0);
  const paidRatio = totalRepay > 0 ? paidAmount / totalRepay : 0;

  const pendingRequest = await prisma.advanceTopUpRequest.findFirst({
    where: { applicationId: app.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, requestedAmount: true, createdAt: true },
  });

  const maxRequestAmount = Math.round(originalAmount * MAX_MULTIPLIER * 100) / 100;
  // Floor at $500 - matches the existing apply-flow minimum.
  const minRequestAmount = Math.min(500, maxRequestAmount);

  return {
    ok: true,
    eligible: paidRatio >= ELIGIBILITY_PAID_RATIO && !pendingRequest,
    originalAmount,
    totalRepay: Math.round(totalRepay * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    paidRatio: Math.round(paidRatio * 1000) / 1000,
    thresholdRatio: ELIGIBILITY_PAID_RATIO,
    maxRequestAmount,
    minRequestAmount,
    existingPending: pendingRequest
      ? {
          id: pendingRequest.id,
          requestedAmount: Number(pendingRequest.requestedAmount),
          createdAt: pendingRequest.createdAt.toISOString(),
        }
      : null,
  };
}

export async function submitTopUpRequest(input: { amount: number }): Promise<
  { ok: true; requestId: string; requestedAmount: number } | { ok: false; error: string }
> {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) return { ok: false, error: "Not signed in" };

  const eligibility = await getTopUpEligibility();
  if (!eligibility.ok) return { ok: false, error: eligibility.error };
  if (!eligibility.eligible) {
    return {
      ok: false,
      error: eligibility.existingPending
        ? "You already have a top-up request under review."
        : `You're eligible after paying 50% of your advance. You're at ${Math.round(eligibility.paidRatio * 100)}%.`,
    };
  }

  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount < eligibility.minRequestAmount || amount > eligibility.maxRequestAmount) {
    return {
      ok: false,
      error: `Enter an amount between $${eligibility.minRequestAmount} and $${eligibility.maxRequestAmount}.`,
    };
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, contact: { select: { id: true } } },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const request = await prisma.advanceTopUpRequest.create({
    data: {
      applicationId: app.id,
      contactId: app.contact?.id || null,
      requestedAmount: amount,
      status: "PENDING",
    },
  });

  // Tag + activity entry on the linked contact so the admin's CRM
  // surfaces the request without needing a separate admin view.
  if (app.contact?.id) {
    const contactId = app.contact.id;
    await prisma.contactTag.upsert({
      where: { contactId_tag: { contactId, tag: "topup-request" } },
      create: { contactId, tag: "topup-request" },
      update: {},
    }).catch(() => null);
    await prisma.activity.create({
      data: {
        contactId,
        type: "topup_requested",
        title: `Top-up request: $${amount.toLocaleString()}`,
        details: JSON.stringify({ requestId: request.id, requestedAmount: amount }),
        performedBy: "portal:customer",
      },
    }).catch(() => null);
  }

  await logAudit({
    action: "OFFER_SET",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: "portal:customer",
    details: { kind: "TOPUP_REQUEST", requestedAmount: amount, requestId: request.id },
  });

  return { ok: true, requestId: request.id, requestedAmount: amount };
}

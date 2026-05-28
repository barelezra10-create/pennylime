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
    select: { offerToken: true, offerStatus: true, status: true },
  });
  const offerToken = existing?.offerToken ?? randomBytes(24).toString("hex");
  // Only notify on the first time an offer goes out. Edits to an
  // existing OFFERED record (e.g. Bar tweaking the plans, recompute
  // button) shouldn't spam the borrower with duplicate emails.
  const wasFirstOffer = existing?.offerStatus !== "OFFERED";

  // Sending an offer is the approval action - there's no separate
  // Approve button in the admin UI. Flip status PENDING -> APPROVED
  // so the badge says "Offer Sent" instead of staying on "Pending".
  // Only nudge status when it's still PENDING to avoid downgrading
  // a later FUNDED/ACTIVE application back to APPROVED when the
  // admin recomputes offer plans.
  const shouldApprove = existing?.status === "PENDING";

  const updated = await prisma.application.update({
    where: { id: input.applicationId },
    data: {
      offerStatus: "OFFERED",
      offeredMinAmount: input.offeredMinAmount,
      offeredMaxAmount: input.offeredMaxAmount,
      offeredTermsJson: JSON.stringify(input.terms),
      offerToken,
      offerSentAt: new Date(),
      ...(shouldApprove && {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: session.user.email,
      }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      applicationCode: true,
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
      notified: wasFirstOffer,
    },
  });

  // Fire the offer-ready notification on first send. Pulled out into
  // a helper so callers (and tests) can also trigger it explicitly.
  if (wasFirstOffer) {
    await sendOfferReadyNotification({
      applicationId: input.applicationId,
      email: updated.email,
      phone: updated.phone,
      firstName: updated.firstName,
      applicationCode: updated.applicationCode,
      offerToken,
      approvedAmount: input.offeredMaxAmount,
      terms: input.terms,
    }).catch((err) =>
      console.error("[offer-ready] notification dispatch failed:", err),
    );
  }

  return { ok: true as const, offerToken, notified: wasFirstOffer };
}

/**
 * Admin-triggered resend of the offer-ready email + SMS for an
 * existing OFFERED application. Used when the original automatic
 * dispatch didn't fire (e.g. applicant approved before the
 * notification trigger was wired up) or when the borrower says
 * they never got the email.
 */
export async function resendOfferNotification(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      applicationCode: true,
      offerToken: true,
      offerStatus: true,
      offeredMaxAmount: true,
      offeredTermsJson: true,
    },
  });
  if (!app) return { ok: false as const, error: "Application not found" };
  if (!app.offerToken) return { ok: false as const, error: "No offer link to send" };
  if (app.offerStatus !== "OFFERED") {
    return { ok: false as const, error: "Offer is not in OFFERED state" };
  }
  let terms: OfferTerm[] = [];
  try {
    terms = app.offeredTermsJson ? JSON.parse(app.offeredTermsJson) : [];
  } catch {
    return { ok: false as const, error: "Saved offer terms are corrupted" };
  }
  if (terms.length === 0) return { ok: false as const, error: "Offer has no terms saved" };

  await sendOfferReadyNotification({
    applicationId: app.id,
    email: app.email,
    phone: app.phone,
    firstName: app.firstName,
    applicationCode: app.applicationCode,
    offerToken: app.offerToken,
    approvedAmount: Number(app.offeredMaxAmount ?? 0),
    terms,
  });

  await logAudit({
    action: "OFFER_NOTIFICATION_RESENT",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: session.user.email,
  });

  return { ok: true as const };
}

/**
 * Fires the offer-ready email + SMS for a freshly approved applicant.
 * Idempotent at the dispatch level — caller decides when to invoke.
 * Always passes contactId when there's a linked Contact so the CRM
 * timeline shows the touch.
 */
export async function sendOfferReadyNotification(input: {
  applicationId: string;
  email: string;
  phone: string | null;
  firstName: string;
  applicationCode: string;
  offerToken: string;
  approvedAmount: number;
  terms: OfferTerm[];
}) {
  const recommended = input.terms.find((t) => t.isRecommended) ?? input.terms[0];
  if (!recommended) return;

  // Back-derive the weekly compound rate from the recommended plan so
  // the customer-facing copy says "5% per week" without us having to
  // store the rate explicitly on the application.
  let weeklyRate = 0;
  if (recommended.disbursedAmount > 0 && recommended.durationWeeks > 0 && recommended.weeklyRemittance > 0) {
    const total = recommended.weeklyRemittance * recommended.durationWeeks;
    const ratio = total / recommended.disbursedAmount;
    if (ratio > 1) {
      weeklyRate = Math.round((Math.pow(ratio, 1 / recommended.durationWeeks) - 1) * 10000) / 100;
    }
  }
  const totalRepaid = recommended.weeklyRemittance * recommended.durationWeeks;

  // Find the linked CRM contact so EmailEvent + Activity + SmsMessage
  // all attach to the timeline.
  const contact = await prisma.contact.findFirst({
    where: { applicationId: input.applicationId },
    select: { id: true },
  });

  // Pull the applicant context the PDF generator needs. Falling back
  // gracefully when fields are missing — the PDF will just show "—"
  // for unknowns rather than failing.
  const applicantContext = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: {
      addressStreet: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      plaidInstitutionName: true,
      plaidAccountMask: true,
      plaidAccountSubtype: true,
      bankName: true,
      lastName: true,
    },
  });
  const fullAddress = applicantContext
    ? [
        applicantContext.addressStreet,
        [applicantContext.addressCity, applicantContext.addressState].filter(Boolean).join(", "),
        applicantContext.addressZip,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;

  // Build the filled agreement PDF. This is best-effort — if PDF
  // generation fails (Chromium download flake, etc.) we still want
  // the email to go out with the offer link, so we just skip the
  // attachment and log the error.
  let pdfAttachment: { filename: string; content: Buffer } | null = null;
  try {
    const { buildFilledAgreementHtml, renderHtmlToPdf } = await import(
      "@/lib/pdf/agreement-pdf"
    );
    const filledHtml = await buildFilledAgreementHtml({
      firstName: input.firstName,
      lastName: applicantContext?.lastName ?? "",
      fullAddress,
      bankName: applicantContext?.plaidInstitutionName ?? applicantContext?.bankName ?? null,
      bankAccountMask: applicantContext?.plaidAccountMask ?? null,
      accountSubtype: applicantContext?.plaidAccountSubtype ?? null,
      approvedAmount: input.approvedAmount,
      recommendedTerm: recommended,
    });
    const pdfBuffer = await renderHtmlToPdf(filledHtml);
    pdfAttachment = {
      filename: `pennylime-offer-${input.applicationCode}.pdf`,
      content: pdfBuffer,
    };
  } catch (pdfErr) {
    console.error("[offer-ready] PDF generation failed (email will still send):", pdfErr);
  }

  // Email
  const { offerReadyEmail } = await import("@/lib/emails/offer-ready");
  const { sendEmail } = await import("@/lib/emails/send");
  const emailContent = offerReadyEmail({
    firstName: input.firstName,
    applicationCode: input.applicationCode,
    offerToken: input.offerToken,
    approvedAmount: input.approvedAmount,
    weeklyRate,
    recommendedDurationWeeks: recommended.durationWeeks,
    recommendedWeeklyRemittance: recommended.weeklyRemittance,
    recommendedTotalRepaid: totalRepaid,
  });
  await sendEmail({
    to: input.email,
    subject: emailContent.subject,
    html: emailContent.html,
    contactId: contact?.id,
    templateId: "offer-ready",
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
  });

  // SMS (only if we have a phone)
  if (input.phone) {
    const { offerReadySms } = await import("@/lib/sms/transactional");
    const { sendSms } = await import("@/lib/sms/twilio");
    await sendSms({
      to: input.phone,
      body: offerReadySms({
        firstName: input.firstName,
        applicationCode: input.applicationCode,
        offerToken: input.offerToken,
        approvedAmount: input.approvedAmount,
      }),
      contactId: contact?.id,
      templateId: "offer-ready",
    });
  }
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
      plaidAccountSubtype: true,
      bankName: true,
      bankAccountNumberManual: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
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

  const addressParts = [
    app.addressStreet,
    [app.addressCity, app.addressState].filter(Boolean).join(", "),
    app.addressZip,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : null;

  // CFDL gate signal: tell the offer page if this merchant's state
  // requires a Commercial Financing Disclosure before accepting, and
  // whether they've already signed one.
  const { isCfdlState, normalizeStateCode } = await import(
    "@/lib/compliance/cfdl/state-requirements"
  );
  const stateCode = normalizeStateCode(app.addressState);
  const cfdlState = stateCode && isCfdlState(stateCode) ? stateCode : null;
  const cfdlSigned = cfdlState
    ? !!(await prisma.cfdlDisclosure.findFirst({
        where: { applicationId: app.id },
        select: { id: true },
      }))
    : false;

  return {
    ok: true as const,
    applicationId: app.id,
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
    accountSubtype: app.plaidAccountSubtype ?? null,
    fullAddress,
    cfdlState,
    cfdlSigned,
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
  // Stronger consent evidence: required for new clients.
  scrolledToBottom?: boolean;
  signedName?: string;
}) {
  // Refuse if the new consent gate wasn't satisfied. Old clients that
  // don't pass the booleans (e.g. browser cached the older page)
  // still work — backward-compatible — but new clients must pass true.
  if (input.agreedToAgreement === false || input.agreedToAch === false) {
    return { ok: false as const, error: "You must agree to both the agreement and the ACH authorization to accept." };
  }
  // Typed-name signature gate: only enforced when the client actually
  // sends a signedName field. Old cached clients without it still work.
  if (input.signedName !== undefined) {
    const trimmed = input.signedName.trim();
    if (trimmed.length < 4 || !/\s/.test(trimmed)) {
      return { ok: false as const, error: "Please type your full legal name (first and last) to sign." };
    }
  }
  if (input.scrolledToBottom === false) {
    return { ok: false as const, error: "You must read the agreement to the end before accepting." };
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

  // CFDL gate: NY/CA/UT/VA/GA merchants must sign the state Commercial
  // Financing Disclosure BEFORE acceptOffer can run. If they haven't, we
  // refuse acceptance instead of letting the RPSA signature land without
  // the required state disclosure - which would be a misrepresentation
  // and a CFDL violation.
  const { isCfdlState, normalizeStateCode } = await import(
    "@/lib/compliance/cfdl/state-requirements"
  );
  const merchantState = normalizeStateCode(app.addressState);
  if (merchantState && isCfdlState(merchantState)) {
    const existingDisclosure = await prisma.cfdlDisclosure.findFirst({
      where: { applicationId: app.id },
      select: { id: true },
    });
    if (!existingDisclosure) {
      return {
        ok: false as const,
        error: `You must review and sign the ${merchantState} state Commercial Financing Disclosure before accepting this offer.`,
      };
    }
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

  // Build payment schedule from the selected term. The plan rows in
  // offeredTermsJson are priced for a specific disbursedAmount (the
  // base the admin used in "Generate plans"). When the borrower slides
  // to a *different* amount on the offer page, the offer-page client
  // scales the numbers linearly — disbursedAmount × N → weeklyPayment × N
  // and the agreement / authorization text shows the scaled totals. The
  // schedule we persist HAS to use the same scaled values, otherwise
  // we'd debit less than what the borrower agreed to (e.g. Harrison
  // accepted $2,000 against a plan priced for $500 → we'd only collect
  // 25% of the agreed total).
  const scaleRatio =
    term.disbursedAmount > 0 ? input.selectedAmount / term.disbursedAmount : 1;
  const scaledWeeklyPayment =
    Math.round(term.weeklyRemittance * scaleRatio * 100) / 100;

  // Snap each weekly due date to the borrower's preferredChargeDay if
  // we computed one from their bank deposit pattern — debit lands when
  // balance is freshest, lifting success rates.
  const schedule = generateWeeklySchedule({
    principal: input.selectedAmount,
    weeklyPayment: scaledWeeklyPayment,
    termWeeks: term.durationWeeks,
    startDate: new Date(),
    preferredChargeDay: app.preferredChargeDay,
  });

  // Transactionally update Application + insert the schedule. Avoids the
  // bad state where the app is marked APPROVED/ACCEPTED but the payment
  // schedule never landed (e.g. Postgres ran out of connections during
  // the createMany). Either both succeed or neither.
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: {
        offerStatus: "ACCEPTED",
        acceptedAmount: input.selectedAmount,
        acceptedTermIndex: input.selectedTermIndex,
        acceptedAt: new Date(),
        status: "APPROVED",
        approvedAt: new Date(),
        fundedAmount: input.selectedAmount,
      },
    });
    if (schedule.length > 0) {
      await tx.payment.createMany({
        data: schedule.map((p) => ({
          applicationId: app.id,
          paymentNumber: p.paymentNumber,
          amount: p.amount,
          principal: p.principal,
          interest: p.interest,
          lateFee: 0,
          dueDate: p.dueDate,
          // PENDING so the daily payment-processor cron picks it up. We
          // used to write SCHEDULED but the cron filters on PENDING - any
          // SCHEDULED payment was orphaned and never debited.
          status: "PENDING",
        })),
      });
    }
  });

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
        signedName: input.signedName?.trim() || null,
        scrolledToBottom: input.scrolledToBottom === true,
      },
    });
  } catch (err) {
    console.error("Failed to persist AchAuthorization:", err);
  }

  // Generate the executed agreement PDF, save it to CRM Files, AND
  // email a copy to the borrower as an attachment. Customers asked
  // for the email copy so they have a record of what they signed.
  //
  // Best-effort — never blocks acceptance; if Chromium / PDF gen
  // fails the borrower is still officially accepted and admin can
  // re-trigger from the ACH Authorization card.
  try {
    const { emailSignedAgreementToCustomer } = await import("@/actions/signed-agreement");
    emailSignedAgreementToCustomer(app.id).catch((err) =>
      console.error("[signed-agreement] PDF + email pipeline failed (non-blocking):", err),
    );
  } catch (err) {
    console.error("[signed-agreement] import failed:", err);
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

  // Advance the linked contact to OFFER_ACCEPTED unless they've already
  // moved past it (FUNDED/REPAYING/PAID_OFF/DEFAULTED). Best-effort —
  // failures must not break offer acceptance.
  try {
    const linkedContact = await prisma.contact.findFirst({
      where: { applicationId: app.id },
      select: { id: true, stage: true },
    });
    if (linkedContact && ["LEAD", "CONTACTED", "APPLICANT", "APPROVED"].includes(linkedContact.stage)) {
      const { updateContactStage } = await import("@/actions/contacts");
      await updateContactStage(linkedContact.id, "OFFER_ACCEPTED");
    }
  } catch (err) {
    console.error("[contacts] OFFER_ACCEPTED stage update failed:", err);
  }

  // Best-effort disbursement using the fastest rail the borrower's bank
  // supports. safeDisburse tries RTP first (instant), falls back to
  // Same-Day ACH, then standard ACH. Failures here don't block
  // acceptance - admin can retry from the detail page.
  try {
    if (process.env.INCREASE_API_KEY) {
      const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
      const { safeDisburse } = await import("@/lib/increase");
      const ext = await ensureIncreaseExternalAccount(app.id);
      if (ext.ok) {
        const transfer = await safeDisburse({
          externalAccountId: ext.externalAccountId,
          amountCents: Math.round(input.selectedAmount * 100),
          statementDescriptor: "PENNYLIME ADV",
          individualName: `${app.firstName} ${app.lastName}`.slice(0, 22),
          remittanceInformation: `PennyLime advance - ${app.applicationCode}`,
        });
        if (transfer.ok) {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: "FUNDED",
              fundedAt: new Date(),
              fundedAmount: input.selectedAmount,
              increaseTransferId: transfer.transferId,
              increaseTransferStatus: transfer.status,
            },
          });
          console.log(`[disburse] app ${app.applicationCode} funded via ${transfer.rail}`);
          // Move linked contact to FUNDED stage (drives stage-tracking).
          const linkedContact = await prisma.contact.findFirst({
            where: { applicationId: app.id },
          });
          if (linkedContact) {
            const { updateContactStage } = await import("@/actions/contacts");
            updateContactStage(linkedContact.id, "FUNDED").catch((err) =>
              console.error("[stage] funded stage update failed:", err),
            );
          }

          // Send the 'funds on the way' email + SMS so the borrower
          // knows the ACH credit is going out. The fundApplication
          // path (legacy admin Fund button) does this; the auto-fund
          // path inside acceptOffer was missing it, so customers
          // funded via auto-accept got no confirmation. Best-effort —
          // failures don't block the rest of the flow.
          try {
            const { sendEmail } = await import("@/lib/emails/send");
            const { sendSms } = await import("@/lib/sms/twilio");
            const { advanceFundedEmail } = await import("@/lib/emails/advance-funded");
            const { advanceFundedSms } = await import("@/lib/sms/transactional");

            // Pull the schedule we just created so the email shows
            // the borrower's real debit dates + amounts.
            const persistedSchedule = await prisma.payment.findMany({
              where: { applicationId: app.id },
              orderBy: { paymentNumber: "asc" },
              select: {
                paymentNumber: true,
                amount: true,
                principal: true,
                interest: true,
                dueDate: true,
              },
            });
            const scheduleForEmail = persistedSchedule.map((p) => ({
              paymentNumber: p.paymentNumber,
              amount: Number(p.amount),
              principal: Number(p.principal),
              interest: Number(p.interest),
              dueDate: p.dueDate,
              lateFee: 0,
            }));

            // Back-derive a rate/term so the email template (which
            // expects them) renders cleanly. The accepted term has
            // the source of truth.
            const acceptedTerm = term;
            const termWeeks = acceptedTerm.durationWeeks;
            // Display interestRate as the effective weekly cost
            // percentage (per-payment cost over disbursed). Email
            // template just shows it as a number on the receipt.
            const totalRepay = scheduleForEmail.reduce((s, p) => s + p.amount, 0);
            const interestPct =
              input.selectedAmount > 0
                ? Math.round(((totalRepay - input.selectedAmount) / input.selectedAmount) * 1000) / 10
                : 0;

            if (scheduleForEmail.length > 0) {
              sendEmail({
                to: app.email,
                ...advanceFundedEmail({
                  firstName: app.firstName,
                  applicationCode: app.applicationCode,
                  fundedAmount: input.selectedAmount,
                  interestRate: interestPct,
                  loanTermMonths: termWeeks,
                  monthlyPayment: scheduleForEmail[0].amount,
                  firstDueDate: scheduleForEmail[0].dueDate,
                  schedule: scheduleForEmail,
                }),
                contactId: linkedContact?.id,
                templateId: "advance-funded",
              }).catch((err) =>
                console.error("[email] advance-funded send failed:", err),
              );

              sendSms({
                to: app.phone,
                body: advanceFundedSms({
                  firstName: app.firstName,
                  fundedAmount: input.selectedAmount,
                  firstDueDate: scheduleForEmail[0].dueDate,
                }),
                contactId: linkedContact?.id,
                templateId: "advance-funded",
              }).catch((err) =>
                console.error("[sms] advance-funded send failed:", err),
              );
            }
          } catch (err) {
            console.error("[advance-funded] notification pipeline failed:", err);
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

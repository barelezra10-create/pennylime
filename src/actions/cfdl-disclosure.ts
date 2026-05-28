"use server";

import { headers } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { calculateApr } from "@/lib/compliance/cfdl/apr-calculator";
import {
  isCfdlState,
  requiresCfdlDisclosure,
  normalizeStateCode,
  type CfdlState,
} from "@/lib/compliance/cfdl/state-requirements";
import { renderDisclosureHtml, type DisclosureInputs } from "@/lib/compliance/cfdl/disclosure-template";
import { generateCfdlDisclosurePdf } from "@/lib/compliance/cfdl/generate-pdf";

/**
 * Determine whether a given application requires a CFDL disclosure
 * before the merchant can sign the RPSA. Used by the offer page to
 * gate the accept button.
 */
export async function getCfdlRequirement(applicationId: string): Promise<
  | { required: true; state: CfdlState; alreadySigned: boolean }
  | { required: false }
> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      addressState: true,
      acceptedAmount: true,
      offeredMaxAmount: true,
    },
  });
  if (!app) return { required: false };

  const stateCode = normalizeStateCode(app.addressState);
  if (!stateCode || !isCfdlState(stateCode)) return { required: false };

  const amount = Number(app.acceptedAmount ?? app.offeredMaxAmount ?? 0);
  if (!requiresCfdlDisclosure(stateCode, amount)) return { required: false };

  // Already-signed lookup so the UI can skip the step if the merchant
  // already saw + signed the disclosure (e.g. went back to the offer
  // page after acceptance).
  const existing = await prisma.cfdlDisclosure.findFirst({
    where: { applicationId },
    select: { id: true },
  });

  return { required: true, state: stateCode, alreadySigned: !!existing };
}

/**
 * Compute the disclosure box values for a given offer quote. Pure read,
 * no writes. Powers the on-screen disclosure box on the offer page so
 * the merchant sees the same numbers before they sign.
 */
export async function getCfdlDisclosurePreview(input: {
  applicationId: string;
  selectedAmount: number;
  termWeeks: number;
  weeklyPayment: number;
}): Promise<
  | {
      ok: true;
      state: CfdlState;
      preview: {
        disbursedAmount: number;
        totalRepayment: number;
        financeCharge: number;
        aprPercent: number;
        termDays: number;
        termWeeks: number;
        weeklyPayment: number;
        specifiedPercent: number;
        merchantLegalName: string;
      };
      html: string;
    }
  | { ok: false; error: string }
> {
  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { addressState: true, firstName: true, lastName: true },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const state = normalizeStateCode(app.addressState);
  if (!state || !isCfdlState(state)) {
    return { ok: false, error: "Merchant state is not a CFDL state" };
  }

  const termDays = input.termWeeks * 7;
  const totalRepayment = Math.round(input.weeklyPayment * input.termWeeks * 100) / 100;
  const apr = calculateApr({
    disbursedAmount: input.selectedAmount,
    totalRepayment,
    termDays,
  });
  // Specified percentage of receivables remitted: we set it so each
  // weekly payment ~= weeklyPayment. For PennyLime's product, this is
  // effectively the per-week amount divided by expected weekly business
  // receipts. We approximate at the implied % of the total repayment
  // delivered per week.
  const specifiedPercent =
    totalRepayment > 0
      ? Math.round((input.weeklyPayment / totalRepayment) * 100 * 100) / 100
      : 0;

  const merchantLegalName = `${app.firstName} ${app.lastName}`.trim();

  const preview = {
    disbursedAmount: input.selectedAmount,
    totalRepayment,
    financeCharge: apr.financeCharge,
    aprPercent: apr.aprPercent,
    termDays,
    termWeeks: input.termWeeks,
    weeklyPayment: input.weeklyPayment,
    specifiedPercent,
    merchantLegalName,
  };

  const html = renderDisclosureHtml({
    ...preview,
    merchantState: state,
    effectiveDate: new Date().toISOString(),
  });

  return { ok: true, state, preview, html };
}

/**
 * Persists the merchant's signature on the CFDL disclosure. Generates
 * the PDF, saves it as a Document on the application, and creates the
 * CfdlDisclosure evidence row. Called when the merchant clicks
 * "Acknowledge and continue" on the disclosure screen, BEFORE the RPSA
 * accept flow runs.
 */
export async function signCfdlDisclosure(input: {
  applicationId: string;
  selectedAmount: number;
  termWeeks: number;
  weeklyPayment: number;
  signedName: string;
  scrolledToBottom: boolean;
}): Promise<{ ok: true; disclosureId: string } | { ok: false; error: string }> {
  if (!input.signedName || input.signedName.trim().length < 3) {
    return { ok: false, error: "Please type your full legal name to sign." };
  }
  if (!input.scrolledToBottom) {
    return { ok: false, error: "Please scroll to the end of the disclosure before signing." };
  }

  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true, addressState: true, firstName: true, lastName: true },
  });
  if (!app) return { ok: false, error: "Application not found" };

  const state = normalizeStateCode(app.addressState);
  if (!state || !isCfdlState(state)) {
    return { ok: false, error: "Merchant state is not a CFDL state" };
  }

  const termDays = input.termWeeks * 7;
  const totalRepayment = Math.round(input.weeklyPayment * input.termWeeks * 100) / 100;
  const apr = calculateApr({
    disbursedAmount: input.selectedAmount,
    totalRepayment,
    termDays,
  });
  const specifiedPercent =
    totalRepayment > 0
      ? Math.round((input.weeklyPayment / totalRepayment) * 100 * 100) / 100
      : 0;
  const merchantLegalName = `${app.firstName} ${app.lastName}`.trim();
  const now = new Date();

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || null;
  const ua = reqHeaders.get("user-agent") || null;

  const disclosureInputs: DisclosureInputs = {
    merchantLegalName,
    merchantState: state,
    disbursedAmount: input.selectedAmount,
    totalRepayment,
    financeCharge: apr.financeCharge,
    aprPercent: apr.aprPercent,
    termDays,
    termWeeks: input.termWeeks,
    weeklyPayment: input.weeklyPayment,
    specifiedPercent,
    effectiveDate: now.toISOString(),
  };

  const renderedBody = renderDisclosureHtml(disclosureInputs);
  const bodyHash = crypto.createHash("sha256").update(renderedBody).digest("hex");

  // Generate the PDF for retention.
  let documentId: string | null = null;
  try {
    const pdf = await generateCfdlDisclosurePdf({
      ...disclosureInputs,
      signedName: input.signedName.trim(),
      signedAt: now.toISOString(),
      signedIp: ip,
      signedUserAgent: ua,
      scrolledToBottom: input.scrolledToBottom,
    });
    const fileName = `cfdl-disclosure-${state}-${app.id.slice(0, 8)}.pdf`;
    const storagePath = await storage.upload(pdf, fileName);
    const doc = await prisma.document.create({
      data: {
        applicationId: app.id,
        fileName,
        mimeType: "application/pdf",
        fileSize: pdf.length,
        storagePath,
        documentType: "CFDL_DISCLOSURE_PDF",
      },
    });
    documentId = doc.id;
  } catch (err) {
    console.error("[cfdl] PDF generation failed:", err);
    // Don't block the merchant - the row + hash + signature still get
    // persisted and provide the legal evidence. PDF can be regenerated
    // later from the row + applicationId.
  }

  const disclosure = await prisma.cfdlDisclosure.create({
    data: {
      applicationId: app.id,
      state,
      disbursedAmount: input.selectedAmount,
      totalRepayment,
      financeCharge: apr.financeCharge,
      aprPercent: apr.aprPercent,
      termDays,
      specifiedPercent,
      weeklyPayment: input.weeklyPayment,
      signedName: input.signedName.trim(),
      signedAt: now,
      signedIp: ip,
      signedUserAgent: ua,
      scrolledToBottom: input.scrolledToBottom,
      bodyHash,
      documentId,
    },
  });

  await logAudit({
    action: "OFFER_SET",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: `merchant:${merchantLegalName}`,
    details: {
      kind: "CFDL_DISCLOSURE_SIGNED",
      state,
      disclosureId: disclosure.id,
      disbursedAmount: input.selectedAmount,
      aprPercent: apr.aprPercent,
    },
  });

  return { ok: true, disclosureId: disclosure.id };
}

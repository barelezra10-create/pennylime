"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { buildFilledAgreementHtml, renderHtmlToPdf } from "@/lib/pdf/agreement-pdf";

type Term = {
  weeklyRemittance: number;
  durationWeeks: number;
  disbursedAmount: number;
  totalCostOfCapital: number;
  processingFee: number;
  isRecommended: boolean;
};

/**
 * Builds the "executed" version of the receivables agreement —
 * placeholders filled with the borrower's data, the actual signed
 * schedule, and the borrower's electronic-signature block — and
 * saves it as a Document with type SIGNED_AGREEMENT_PDF so it
 * appears in the CRM Files tab.
 *
 * Idempotent: replaces any prior SIGNED_AGREEMENT_PDF for this app.
 * Safe to re-run after data fixes (e.g. when we patched Harrison's
 * schedule from $111.68 → $446.72).
 */
export async function generateSignedAgreementPdf(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      lastName: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      plaidInstitutionName: true,
      plaidAccountMask: true,
      plaidAccountSubtype: true,
      bankName: true,
      offeredTermsJson: true,
      acceptedAmount: true,
      acceptedTermIndex: true,
    },
  });
  if (!app) return { ok: false as const, error: "Application not found" };
  if (app.acceptedAmount == null || app.acceptedTermIndex == null) {
    return { ok: false as const, error: "Application has not been accepted yet" };
  }

  let terms: Term[] = [];
  try {
    terms = app.offeredTermsJson ? JSON.parse(app.offeredTermsJson) : [];
  } catch {
    return { ok: false as const, error: "Offer terms corrupted" };
  }
  const acceptedTerm = terms[app.acceptedTermIndex];
  if (!acceptedTerm) return { ok: false as const, error: "Accepted term not found" };

  const auth = await prisma.achAuthorization.findFirst({
    where: { applicationId },
    orderBy: { acceptedAt: "desc" },
  });
  if (!auth) return { ok: false as const, error: "No AchAuthorization on file" };

  let schedule: Array<{ paymentNumber: number; date: string; amount: number }> = [];
  try {
    const parsed = JSON.parse(auth.scheduleJson);
    schedule = (parsed as Array<{ paymentNumber: number; date: string; amount: number | string }>)
      .map((p) => ({
        paymentNumber: p.paymentNumber,
        date: new Date(p.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        amount: Number(p.amount),
      }));
  } catch {
    return { ok: false as const, error: "AchAuthorization schedule corrupted" };
  }

  const fullAddress = [
    app.addressStreet,
    [app.addressCity, app.addressState].filter(Boolean).join(", "),
    app.addressZip,
  ]
    .filter(Boolean)
    .join(", ") || null;

  const html = await buildFilledAgreementHtml({
    firstName: app.firstName,
    lastName: app.lastName,
    fullAddress,
    bankName: app.plaidInstitutionName ?? app.bankName ?? null,
    bankAccountMask: app.plaidAccountMask ?? null,
    accountSubtype: app.plaidAccountSubtype ?? null,
    approvedAmount: Number(app.acceptedAmount),
    recommendedTerm: acceptedTerm,
    signed: {
      signedName: auth.signedName,
      signedAt: auth.acceptedAt.toISOString(),
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      scrolledToBottom: auth.scrolledToBottom,
      realSchedule: schedule,
      agreementVersion: auth.agreementVersion,
    },
  });

  const pdfBuffer = await renderHtmlToPdf(html);

  // Replace any prior signed PDF for this app so we never have stale
  // versions floating around in the Files tab.
  const existing = await prisma.document.findMany({
    where: { applicationId, documentType: "SIGNED_AGREEMENT_PDF" },
  });
  for (const d of existing) {
    try { await storage.delete(d.storagePath); } catch { /* swallow */ }
    await prisma.document.delete({ where: { id: d.id } });
  }

  const filename = `signed-agreement-${app.applicationCode}.pdf`;
  const storagePath = await storage.upload(pdfBuffer, filename);
  const doc = await prisma.document.create({
    data: {
      applicationId,
      fileName: filename,
      mimeType: "application/pdf",
      fileSize: pdfBuffer.length,
      storagePath,
      documentType: "SIGNED_AGREEMENT_PDF",
    },
  });
  return { ok: true as const, documentId: doc.id, fileName: filename, fileSize: pdfBuffer.length };
}

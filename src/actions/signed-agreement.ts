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
  try {
    return await generateSignedAgreementPdfInner(applicationId);
  } catch (err) {
    console.error("[signed-agreement] generation failed:", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "PDF generation failed",
    };
  }
}

async function generateSignedAgreementPdfInner(applicationId: string) {
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
  return {
    ok: true as const,
    documentId: doc.id,
    fileName: filename,
    fileSize: pdfBuffer.length,
    pdfBuffer,
  };
}

/**
 * After offer acceptance: generate the signed agreement PDF (saved
 * to CRM Files) AND email a copy to the borrower as an attachment.
 * Customers asked for this — they want a copy of what they signed
 * to keep on file, not just a website record.
 *
 * Best-effort: if any step fails, the others still run. Acceptance
 * is already persisted by the time this is called.
 */
export async function emailSignedAgreementToCustomer(applicationId: string) {
  try {
    const result = await generateSignedAgreementPdfInner(applicationId);
    if (!result.ok || !result.pdfBuffer) {
      console.error("[signed-agreement] PDF generation failed for email send:", "error" in result ? result.error : "no buffer");
      return { ok: false as const };
    }

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        firstName: true,
        email: true,
        applicationCode: true,
        acceptedAmount: true,
      },
    });
    if (!app) return { ok: false as const };

    const linkedContact = await prisma.contact.findFirst({
      where: { applicationId },
      select: { id: true },
    });

    const { sendEmail } = await import("@/lib/emails/send");
    const amount = Number(app.acceptedAmount ?? 0);
    await sendEmail({
      to: app.email,
      subject: `Your signed PennyLime agreement — copy attached`,
      html: `
        <h2 style="color:#15803d;margin:0 0 10px;">Thanks, ${app.firstName}.</h2>
        <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px;">
          We've received your signed agreement for the $${amount.toLocaleString()} advance.
          A complete copy of the signed agreement is attached to this email for your records.
        </p>
        <p style="font-size:14px;color:#52525b;margin:0 0 16px;">
          The PDF includes the full Receivables Purchase and Sale Agreement, your accepted plan, the weekly debit schedule, and your electronic signature (timestamp, IP, and confirmation that you scrolled through the agreement).
        </p>
        <p style="font-size:14px;color:#52525b;margin:0 0 16px;">
          We'll be in touch shortly with funding confirmation. If you have any questions in the meantime, reply directly to this email and we'll get back to you.
        </p>
        <p style="font-size:14px;color:#52525b;margin:0;">
          Thanks,<br/>The PennyLime Team
        </p>
      `,
      attachments: [
        { filename: result.fileName, content: result.pdfBuffer },
      ],
      contactId: linkedContact?.id,
      templateId: "signed-agreement-receipt",
    });

    return { ok: true as const };
  } catch (err) {
    console.error("[signed-agreement] customer email send failed:", err);
    return { ok: false as const };
  }
}

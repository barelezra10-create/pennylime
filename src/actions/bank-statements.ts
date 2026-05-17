"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getLoanRules } from "@/lib/rules-engine";
import { revalidatePath } from "next/cache";

const ALLOWED_BANK_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
]);

/**
 * Admin uploads bank-statement files (PDF, CSV, JPEG/PNG photos of
 * statements) to an application. Each file is stored via the existing
 * storage adapter and a Document row is created with
 * documentType="BANK_STATEMENT_90D" so it shows in the application's
 * documents list separately from pay-stub uploads.
 */
export async function uploadBankStatements(applicationId: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return { ok: false as const, error: "No files provided" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true },
  });
  if (!application) return { ok: false as const, error: "Application not found" };

  const rules = await getLoanRules();
  const maxMb = Number(rules.max_file_size_mb || "10");
  const maxBytes = maxMb * 1024 * 1024;

  const uploaded: Array<{ fileName: string; storagePath: string }> = [];

  for (const file of files) {
    if (!ALLOWED_BANK_TYPES.has(file.type)) {
      return { ok: false as const, error: `Unsupported file type: ${file.type}. Accepts PDF, CSV, or photo.` };
    }
    if (file.size > maxBytes) {
      return { ok: false as const, error: `${file.name} exceeds ${maxMb}MB` };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await storage.upload(buffer, file.name);
    await prisma.document.create({
      data: {
        applicationId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath,
        documentType: "BANK_STATEMENT_90D",
      },
    });
    uploaded.push({ fileName: file.name, storagePath });
  }

  await prisma.auditLog.create({
    data: {
      action: "UPLOAD_BANK_STATEMENTS",
      entityType: "APPLICATION",
      entityId: applicationId,
      performedBy: session.user.email,
      details: JSON.stringify({ count: uploaded.length, fileNames: uploaded.map((u) => u.fileName) }),
    },
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  return { ok: true as const, count: uploaded.length, uploaded };
}

/**
 * Delete any uploaded document attached to an application (pay stub,
 * bank statement, ID photo, anything). Best-effort removes the file
 * from storage too — DB row is the source of truth, so if the file
 * was already wiped by an ephemeral-disk deploy the row still cleans
 * up.
 */
export async function deleteApplicationDocument(documentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, applicationId: true, fileName: true, storagePath: true, documentType: true },
  });
  if (!doc) return { ok: false as const, error: "Document not found" };

  try {
    await storage.delete(doc.storagePath);
  } catch (err) {
    console.warn("Failed to delete storage file:", doc.storagePath, err);
  }

  await prisma.document.delete({ where: { id: doc.id } });

  await prisma.auditLog.create({
    data: {
      action: "DELETE_DOCUMENT",
      entityType: "APPLICATION",
      entityId: doc.applicationId,
      performedBy: session.user.email,
      details: JSON.stringify({ fileName: doc.fileName, documentType: doc.documentType }),
    },
  });

  revalidatePath(`/admin/applications/${doc.applicationId}`);
  return { ok: true as const };
}

/** @deprecated use deleteApplicationDocument — kept as alias so existing
 *  imports keep working until they migrate. */
export const deleteBankStatement = deleteApplicationDocument;

/**
 * Cadence label from the AI parser (e.g. "biweekly") → string that
 * matches what Plaid Transactions sets in application.depositCadence
 * (lowercase, space-separated).
 */
function normalizeCadence(c: string | undefined | null): string | null {
  if (!c) return null;
  return String(c).toLowerCase().replace(/[_-]/g, " ").trim();
}

/**
 * Sends every BANK_STATEMENT_90D document attached to the application
 * to Gemini, asks it to extract deposits + a monthly income summary,
 * then writes the result into the same Application columns Plaid Bank
 * Income / Transactions would populate. The rules engine re-evaluates
 * automatically on next page load.
 */
export async function parseBankStatementsWithAI(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };

  const documents = await prisma.document.findMany({
    where: { applicationId, documentType: "BANK_STATEMENT_90D" },
    orderBy: { createdAt: "asc" },
  });
  if (documents.length === 0) {
    return { ok: false as const, error: "No bank statements uploaded yet" };
  }

  // Read each file from storage as a Buffer.
  const pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
  for (const doc of documents) {
    try {
      const buffer = await storage.read(doc.storagePath);
      pdfs.push({ filename: doc.fileName, buffer, mimeType: doc.mimeType });
    } catch (err) {
      console.error("Failed to read bank statement from storage:", doc.fileName, err);
    }
  }
  if (pdfs.length === 0) {
    return { ok: false as const, error: "Could not read uploaded statements from storage" };
  }

  const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
  let parsed;
  try {
    parsed = await parseStatementsWithAI(pdfs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parse failed";
    console.error("Bank statement AI parse error:", message);
    return { ok: false as const, error: message };
  }

  // Write into the same fields Plaid would populate so the rules engine
  // + admin UI treat this as verified income, indistinguishable in
  // shape from a Plaid pull.
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      monthlyIncome: parsed.monthlyIncome,
      totalIncome: parsed.monthlyIncome * 3,
      avgWeeklyIncome: parsed.avgWeeklyIncome,
      depositCount90d: parsed.depositCount,
      largestDeposit: parsed.largestDeposit,
      depositCadence: normalizeCadence(parsed.estimatedCadence),
      plaidIdentityName: parsed.accountHolderName ?? undefined,
      plaidInstitutionName: parsed.bankName ?? undefined,
      lastPlaidRefresh: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "AI_PARSE_BANK_STATEMENTS",
      entityType: "APPLICATION",
      entityId: applicationId,
      performedBy: session.user.email,
      details: JSON.stringify({
        statementCount: pdfs.length,
        monthlyIncome: parsed.monthlyIncome,
        depositCount: parsed.depositCount,
        confidence: parsed.confidence,
        accountHolderName: parsed.accountHolderName,
      }),
    },
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  return {
    ok: true as const,
    monthlyIncome: parsed.monthlyIncome,
    avgWeeklyIncome: parsed.avgWeeklyIncome,
    depositCount: parsed.depositCount,
    largestDeposit: parsed.largestDeposit,
    cadence: parsed.estimatedCadence,
    accountHolderName: parsed.accountHolderName,
    bankName: parsed.bankName,
    confidence: parsed.confidence,
    notes: parsed.notes,
    statementPeriodStart: parsed.statementPeriodStart,
    statementPeriodEnd: parsed.statementPeriodEnd,
  };
}

/**
 * Admin sets the verified monthly income after reviewing the uploaded
 * statements. Updates both `monthlyIncome` (what the rules engine
 * reads to produce a recommendation) AND `totalIncome` (kept in sync
 * as monthlyIncome × 3) so the existing "Total 3-Month Income" UI
 * still shows the right number.
 */
export async function setVerifiedMonthlyIncome(
  applicationId: string,
  monthlyIncome: number,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  if (!isFinite(monthlyIncome) || monthlyIncome < 0) {
    return { ok: false as const, error: "Invalid amount" };
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      monthlyIncome,
      totalIncome: monthlyIncome * 3,
      lastPlaidRefresh: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "SET_VERIFIED_INCOME",
      entityType: "APPLICATION",
      entityId: applicationId,
      performedBy: session.user.email,
      details: JSON.stringify({ monthlyIncome }),
    },
  });
  revalidatePath(`/admin/applications/${applicationId}`);
  return { ok: true as const };
}

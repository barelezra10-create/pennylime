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

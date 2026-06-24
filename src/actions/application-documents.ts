"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getLoanRules } from "@/lib/rules-engine";
import { evaluateWorkSignals } from "@/lib/risk/work-verification";

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
]);

/**
 * Applicant-facing: called right after submitApplication() returns the
 * new application id. Stores the uploaded 90-day bank statement(s),
 * saves the business EIN, then parses the statement and runs the
 * deterministic work-verification comparator. A WEAK/UNVERIFIED result
 * soft-flags the application for manual review — it never blocks
 * submission, and every failure is swallowed so a slow/AI parse can't
 * break the applicant's confirmation screen.
 */
export async function finalizeDocumentsAndVerify(
  applicationId: string,
  formData: FormData
) {
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, workerType: true },
    });
    if (!app) return { ok: false as const, error: "Application not found" };

    const rules = await getLoanRules();
    const maxBytes = Number(rules.max_file_size_mb || "10") * 1024 * 1024;

    // 1. Store statement files.
    const files = (formData.getAll("statement") as File[]).filter(Boolean);
    const stored: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
    for (const file of files) {
      if (!ALLOWED_DOC_TYPES.has(file.type) || file.size > maxBytes) continue;
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
      stored.push({ filename: file.name, buffer, mimeType: file.type });
    }

    // 2. Save EIN (business owners).
    const ein = (formData.get("ein") as string | null)?.replace(/\D/g, "") ?? "";
    if (ein) {
      await prisma.application.update({
        where: { id: applicationId },
        data: { ein: ein.replace(/(\d{2})(\d{7})/, "$1-$2") },
      });
    }

    // 3. Parse the statement (best-effort) to get deposits + income.
    let deposits: Array<{ description: string; amount: number }> = [];
    if (stored.length > 0) {
      try {
        const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
        const parsed = await parseStatementsWithAI(stored);
        deposits = (parsed.deposits ?? []).map((d) => ({
          description: d.description,
          amount: d.amount,
        }));
        await prisma.application.update({
          where: { id: applicationId },
          data: {
            monthlyIncome: parsed.monthlyIncome,
            totalIncome: parsed.monthlyIncome * 3,
            avgWeeklyIncome: parsed.avgWeeklyIncome,
            depositCount90d: parsed.depositCount,
            largestDeposit: parsed.largestDeposit,
          },
        });
      } catch (err) {
        console.error("[finalizeDocuments] statement parse failed:", err);
      }
    }

    // 4. Verify the declared work against the deposits.
    const verdict = evaluateWorkSignals({
      workerType: app.workerType ?? "INDEPENDENT_CONTRACTOR",
      deposits,
    });
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        workVerificationStatus: verdict.status,
        workVerificationJson: JSON.stringify(verdict),
        workVerificationAt: new Date(),
        workNeedsReview: verdict.status !== "VERIFIED",
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "WORK_VERIFICATION",
        entityType: "APPLICATION",
        entityId: applicationId,
        performedBy: "applicant",
        details: JSON.stringify({
          statements: stored.length,
          hasEin: !!ein,
          status: verdict.status,
          reason: verdict.reason,
        }),
      },
    });

    return { ok: true as const, status: verdict.status };
  } catch (err) {
    console.error("[finalizeDocumentsAndVerify] failed:", err);
    return { ok: false as const, error: "Document processing failed" };
  }
}

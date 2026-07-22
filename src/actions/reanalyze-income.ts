"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { incomeByPlatform } from "@/lib/income-by-platform";
import { revalidatePath } from "next/cache";

/**
 * Re-reads the stored BANK_STATEMENT_90D files for this application,
 * re-parses them with Gemini, and updates incomeByPlatformJson.
 * Guarded by requireNonSupportRole (same as other money-adjacent actions).
 */
export async function reanalyzeIncome(applicationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await requireNonSupportRole();
    if (!auth.ok) return { ok: false, error: auth.error };

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, platform: true },
    });
    if (!application) return { ok: false, error: "Application not found" };

    const documents = await prisma.document.findMany({
      where: { applicationId, documentType: "BANK_STATEMENT_90D" },
      orderBy: { createdAt: "asc" },
    });
    if (documents.length === 0) {
      return { ok: false, error: "No bank statement on file" };
    }

    // Read files from storage — same pattern as parseBankStatementsWithAI.
    const pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
    for (const doc of documents) {
      try {
        const buffer = await storage.read(doc.storagePath);
        pdfs.push({ filename: doc.fileName, buffer, mimeType: doc.mimeType });
      } catch (err) {
        console.error("[reanalyzeIncome] could not read stored statement:", doc.fileName, err);
      }
    }
    if (pdfs.length === 0) {
      return { ok: false, error: "Could not read uploaded statements from storage" };
    }

    const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
    const parsed = await parseStatementsWithAI(pdfs);

    if (!parsed.deposits || parsed.deposits.length === 0) {
      return { ok: false, error: "Parser returned no deposits" };
    }

    const result = incomeByPlatform(parsed.deposits, application.platform ?? null);

    await prisma.application.update({
      where: { id: applicationId },
      data: { incomeByPlatformJson: JSON.stringify(result) },
    });

    revalidatePath(`/admin/applications/${applicationId}`);
    return { ok: true };
  } catch (err) {
    console.error("[reanalyzeIncome] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Re-analyze failed" };
  }
}

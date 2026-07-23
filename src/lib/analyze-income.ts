import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { incomeByPlatform } from "@/lib/income-by-platform";
import { buildMonthlyPL } from "@/lib/monthly-pl";

/**
 * Read the stored 90-day bank statements for an application, parse them with
 * Gemini, and persist the income summary + the income-by-platform breakdown.
 *
 * Shared by the admin "Re-analyze" button and the cron pre-analysis sweep so
 * both paths behave identically. Contains NO auth check — callers are
 * responsible for authorizing (the admin action gates on role, the cron route
 * gates on CRON_SECRET).
 */
export async function analyzeAndStoreIncome(
  applicationId: string,
): Promise<{ ok: true; deposits: number } | { ok: false; error: string }> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, platform: true },
  });
  if (!application) return { ok: false, error: "Application not found" };

  const documents = await prisma.document.findMany({
    where: { applicationId, documentType: "BANK_STATEMENT_90D" },
    orderBy: { createdAt: "asc" },
  });
  if (documents.length === 0) return { ok: false, error: "No bank statement on file" };

  const pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
  for (const doc of documents) {
    try {
      const buffer = await storage.read(doc.storagePath);
      pdfs.push({ filename: doc.fileName, buffer, mimeType: doc.mimeType });
    } catch (err) {
      console.error("[analyzeAndStoreIncome] could not read stored statement:", doc.fileName, err);
    }
  }
  if (pdfs.length === 0) return { ok: false, error: "Could not read uploaded statements from storage" };

  const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
  const parsed = await parseStatementsWithAI(pdfs);

  if (!parsed.deposits || parsed.deposits.length === 0) {
    return { ok: false, error: "Parser returned no deposits" };
  }

  const breakdown = incomeByPlatform(parsed.deposits, application.platform ?? null);
  const pnl = buildMonthlyPL(breakdown, parsed.expenses ?? []);

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      monthlyIncome: parsed.monthlyIncome,
      totalIncome: parsed.monthlyIncome * 3,
      avgWeeklyIncome: parsed.avgWeeklyIncome,
      depositCount90d: parsed.depositCount,
      largestDeposit: parsed.largestDeposit,
      incomeByPlatformJson: JSON.stringify(breakdown),
      monthlyPnlJson: JSON.stringify(pnl),
    },
  });

  return { ok: true, deposits: parsed.deposits.length };
}

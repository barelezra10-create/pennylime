import { prisma } from "@/lib/db";
import { analyzeAndStoreIncome } from "@/lib/analyze-income";
import { analyzeAndStorePlaidIncome } from "@/lib/analyze-plaid-income";

/**
 * Analyze an application's bank activity by whichever source it has:
 *   - uploaded PDF statements  -> Gemini statement parser
 *   - Plaid bank connection    -> Plaid transaction feed
 * so both funnels populate the income-by-platform + monthly P&L panels.
 * Prefers uploaded statements when both exist (the AI parse is richer).
 */
export async function analyzeIncomeAuto(
  applicationId: string,
): Promise<{ ok: true; deposits: number } | { ok: false; error: string }> {
  const hasStatement = await prisma.document.count({
    where: { applicationId, documentType: "BANK_STATEMENT_90D" },
  });
  if (hasStatement > 0) {
    return analyzeAndStoreIncome(applicationId);
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { plaidAccessToken: true },
  });
  if (app?.plaidAccessToken) {
    return analyzeAndStorePlaidIncome(applicationId);
  }

  return { ok: false, error: "No bank statement or Plaid connection on file" };
}

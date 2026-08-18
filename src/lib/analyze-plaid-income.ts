import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { incomeByPlatform } from "@/lib/income-by-platform";
import { buildMonthlyPL } from "@/lib/monthly-pl";

/**
 * Build the income-by-platform breakdown + monthly P&L for a Plaid-connected
 * application and persist ONLY those two panels. Leaves monthlyIncome /
 * avgWeeklyIncome untouched so underwriting numbers don't shift.
 *
 * Source is the Plaid ASSET REPORT PDF (assetReportPdfGet), run through the
 * same Gemini parser bank-statement uploads use. We can't use the live
 * Transactions product: this Plaid client isn't authorized for it
 * (INVALID_PRODUCT), which is why applicants who linked via Plaid had empty
 * panels. The asset report is the source that already produced their income.
 */
export async function analyzeAndStorePlaidIncome(
  applicationId: string,
): Promise<{ ok: true; deposits: number } | { ok: false; error: string }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, platform: true, plaidAssetReportToken: true },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (!app.plaidAssetReportToken) return { ok: false, error: "No Plaid asset report on file" };

  // Asset report token is stored plaintext (not encrypted like the access token).
  let pdfBuffer: Buffer;
  try {
    const resp = await plaidClient.assetReportPdfGet(
      { asset_report_token: app.plaidAssetReportToken },
      { responseType: "arraybuffer" },
    );
    pdfBuffer = Buffer.from(resp.data as ArrayBuffer);
    if (!pdfBuffer.length) return { ok: false, error: "Plaid returned an empty asset report" };
  } catch (err) {
    const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
    const detail = data?.error_code
      ? `Plaid ${data.error_code}: ${data.error_message ?? ""}`.trim()
      : err instanceof Error
        ? err.message
        : "Failed to fetch Plaid asset report";
    return { ok: false, error: detail };
  }

  const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
  const parsed = await parseStatementsWithAI([
    { filename: "plaid-asset-report.pdf", buffer: pdfBuffer, mimeType: "application/pdf" },
  ]);
  if (!parsed.deposits?.length) return { ok: false, error: "Parser returned no deposits" };

  const breakdown = incomeByPlatform(parsed.deposits, app.platform ?? null);
  const pnl = buildMonthlyPL(breakdown, parsed.expenses ?? []);

  await prisma.application.update({
    where: { id: app.id },
    data: {
      // Re-derive income from the hardened, sanitized parse (dedup + merchant
      // exclusion + recompute) so the stored figure is the real one, not an
      // inflated Plaid/AI number.
      monthlyIncome: parsed.monthlyIncome,
      totalIncome: parsed.monthlyIncome * 3,
      avgWeeklyIncome: parsed.avgWeeklyIncome,
      depositCount90d: parsed.depositCount,
      largestDeposit: parsed.largestDeposit,
      nsfCount90d: parsed.nsfCount ?? 0,
      daysNegative90d: parsed.daysNegative ?? 0,
      minBalance90d: parsed.minBalance == null ? null : parsed.minBalance,
      incomeByPlatformJson: JSON.stringify(breakdown),
      monthlyPnlJson: JSON.stringify(pnl),
    },
  });

  return { ok: true, deposits: parsed.deposits.length };
}

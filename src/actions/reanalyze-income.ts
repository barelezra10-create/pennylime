"use server";

import { requireNonSupportRole } from "@/lib/auth-helpers";
import { analyzeAndStoreIncome } from "@/lib/analyze-income";
import { revalidatePath } from "next/cache";

/**
 * Re-reads the stored BANK_STATEMENT_90D files for this application,
 * re-parses them with Gemini, and updates the income summary +
 * incomeByPlatformJson. Guarded by requireNonSupportRole (same as other
 * money-adjacent actions). The heavy lifting lives in analyzeAndStoreIncome
 * so the cron pre-analysis sweep shares identical behavior.
 */
export async function reanalyzeIncome(
  applicationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await requireNonSupportRole();
    if (!auth.ok) return { ok: false, error: auth.error };

    const result = await analyzeAndStoreIncome(applicationId);
    if (!result.ok) return result;

    revalidatePath(`/admin/applications/${applicationId}`);
    return { ok: true };
  } catch (err) {
    console.error("[reanalyzeIncome] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Re-analyze failed" };
  }
}

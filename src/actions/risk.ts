"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeRiskWithAi, type AiRiskAnalysis } from "@/lib/risk/ai-risk";
import { logAudit } from "@/lib/audit";

/**
 * Admin-triggered AI risk analysis. Runs Gemini against the applicant's
 * verified income + bank context and persists the score, recommended
 * weekly rate, verdict, and full structured analysis JSON on the
 * Application row. Re-running overwrites the prior result.
 */
export async function runAiRiskAnalysis(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false as const, error: "Unauthorized" };
  }

  // Rate-limit: if the analysis just ran (< 60s ago), return the cached
  // result instead of firing another Gemini call. Stops double-charging
  // when an admin rage-clicks the button.
  const recent = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { aiRiskAnalysisAt: true, aiRiskAnalysisJson: true },
  });
  if (
    recent?.aiRiskAnalysisAt &&
    recent.aiRiskAnalysisJson &&
    Date.now() - new Date(recent.aiRiskAnalysisAt).getTime() < 60_000
  ) {
    try {
      return {
        ok: true as const,
        analysis: JSON.parse(recent.aiRiskAnalysisJson) as AiRiskAnalysis,
        cached: true,
      };
    } catch {
      // fall through and re-run if the cached JSON is corrupted
    }
  }

  try {
    const analysis = await analyzeRiskWithAi(applicationId);

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        aiRiskScore: analysis.riskScore,
        aiRecommendedRate: analysis.recommendedWeeklyRate,
        aiRiskVerdict: analysis.verdict,
        aiRiskAnalysisJson: JSON.stringify(analysis),
        aiRiskAnalysisAt: new Date(),
      },
    });

    await logAudit({
      action: "AI_RISK_ANALYSIS",
      entityType: "APPLICATION",
      entityId: applicationId,
      performedBy: session.user.email,
      details: {
        riskScore: analysis.riskScore,
        recommendedWeeklyRate: analysis.recommendedWeeklyRate,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
      },
    });

    return { ok: true as const, analysis };
  } catch (err) {
    console.error("[ai-risk] analysis failed:", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "AI risk analysis failed",
    };
  }
}

/**
 * Reads the persisted AI risk analysis off an Application, returning
 * the parsed JSON or null if it's never been run. Cheaper than
 * re-running — admin UI uses this to render the panel without a new
 * Gemini call on every page load.
 */
export async function getAiRiskAnalysis(applicationId: string): Promise<AiRiskAnalysis | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const row = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { aiRiskAnalysisJson: true },
  });
  if (!row?.aiRiskAnalysisJson) return null;
  try {
    return JSON.parse(row.aiRiskAnalysisJson) as AiRiskAnalysis;
  } catch {
    return null;
  }
}

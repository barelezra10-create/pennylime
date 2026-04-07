"use server";

import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/rules-engine";
import type { EvaluationResult } from "@/lib/rules-engine";

export async function evaluateApplicationAction(
  applicationId: string
): Promise<EvaluationResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });

  if (!application) {
    return {
      recommendation: "MANUAL_REVIEW",
      reasons: ["Application not found"],
      suggestedRate: 30,
      rules: {},
      riskScore: null,
    };
  }

  return evaluateApplication(application);
}

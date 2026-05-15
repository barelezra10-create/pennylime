import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

const STAGE_NEXT_STEP: Record<string, string> = {
  PENDING: "We're reviewing your application. Most decisions come back within 24 hours.",
  APPROVED: "Your application is approved. The next step is to accept your offer in your dashboard.",
  REJECTED: "Unfortunately we could not approve this application at this time.",
  FUNDED: "Your loan has been funded. The next step is to review your repayment schedule.",
  WITHDRAWN: "This application was withdrawn.",
};

export const getApplicationStatus: ToolDefinition = {
  name: "getApplicationStatus",
  description: "Look up the status and next step for a specific application by application code.",
  parameters: {
    type: "object",
    properties: { applicationCode: { type: "string" } },
    required: ["applicationCode"],
  },
  requiredAuth: "phone-matched",
  isWrite: false,
  handler: async (args) => {
    const code = String(args.applicationCode ?? "").trim().toUpperCase();
    if (!code) return { status: "error", message: "applicationCode required" };
    const app = await prisma.application.findUnique({
      where: { applicationCode: code },
      select: { id: true, applicationCode: true, status: true, offerStatus: true, acceptedAmount: true },
    });
    if (!app) return { status: "ok", data: { found: false } };
    const stage = app.status;
    const nextStep = STAGE_NEXT_STEP[stage] ?? "Please contact support for an update.";
    return {
      status: "ok",
      data: { found: true, stage, offerStatus: app.offerStatus, nextStep },
      summary: `application ${code}: ${stage}`,
    };
  },
};

"use server";

import { randomBytes } from "crypto";
import { buildTopUpTerm, topUpSourceData, type TopUpTermsInput } from "@/lib/top-up-offer";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type AdminTopUpRow = {
  id: string;
  sourceApplicationId: string;
  requestedAmount: number;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  weeklyRate: number | null;
  offer: null | {
    applicationId: string; applicationCode: string; status: string; sentAt: string | null;
    amount: number; durationWeeks: number; weeklyPayment: number; totalRepayment: number;
    offerToken: string | null;
  };
};

export async function getTopUpRequestsForApplication(applicationId: string): Promise<AdminTopUpRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const rows = await prisma.advanceTopUpRequest.findMany({
    where: { OR: [{ applicationId }, { newApplicationId: applicationId }] },
    orderBy: { createdAt: "desc" },
    include: { newApplication: { select: {
      id: true, applicationCode: true, offerStatus: true, offerSentAt: true,
      offeredMaxAmount: true, offeredTermsJson: true, offerToken: true, fundedAt: true,
    } } },
  });
  return rows.map((r) => {
    const child = r.newApplication;
    const terms = child?.offeredTermsJson ? JSON.parse(child.offeredTermsJson) : [];
    const term = terms[0];
    return {
      id: r.id,
      sourceApplicationId: r.applicationId,
      requestedAmount: Number(r.requestedAmount),
      status: child?.fundedAt ? "FUNDED" : r.status,
      adminNote: r.adminNote,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      weeklyRate: r.weeklyRate == null ? null : Number(r.weeklyRate),
      offer: child && term ? {
        applicationId: child.id, applicationCode: child.applicationCode,
        status: child.offerStatus, sentAt: child.offerSentAt?.toISOString() ?? null,
        amount: Number(child.offeredMaxAmount), durationWeeks: term.durationWeeks,
        weeklyPayment: term.weeklyRemittance,
        totalRepayment: Math.round(term.weeklyRemittance * term.durationWeeks * 100) / 100,
        offerToken: child.offerToken,
      } : null,
    };
  });
}

export async function setTopUpRequestStatus(input: {
  requestId: string;
  status: "APPROVED" | "DECLINED";
  adminNote?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const request = await prisma.advanceTopUpRequest.findUnique({
    where: { id: input.requestId },
  });
  if (!request) return { ok: false, error: "Request not found" };
  if (request.status !== "PENDING") {
    return { ok: false, error: `Request is already ${request.status}` };
  }

  const changed = await prisma.advanceTopUpRequest.updateMany({
    where: { id: input.requestId, status: "PENDING", newApplicationId: null },
    data: {
      status: input.status,
      adminNote: input.adminNote || null,
      reviewedBy: session.user.email,
      reviewedAt: new Date(),
    },
  });

  if (changed.count !== 1) return { ok: false, error: "The request changed. Refresh before reviewing it." };

  await logAudit({
    action: input.status === "APPROVED" ? "APPROVE" : "REJECT",
    entityType: "APPLICATION",
    entityId: request.applicationId,
    performedBy: session.user.email,
    details: {
      kind: "TOPUP_REVIEW",
      requestId: request.id,
      requestedAmount: Number(request.requestedAmount),
      status: input.status,
      adminNote: input.adminNote || null,
    },
  });

  return { ok: true };
}


/** Prepare a separate advance atomically. No emails, signatures or money movement. */
export async function prepareTopUpOffer(input: TopUpTermsInput & { requestId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const reviewer = session.user.email;
  try {
    const childId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AdvanceTopUpRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
      const request = await tx.advanceTopUpRequest.findUnique({ where: { id: input.requestId } });
      if (!request || !["PENDING", "APPROVED"].includes(request.status)) throw new Error("This request is no longer available for an offer.");
      if (request.contractSendingAt && Date.now() - request.contractSendingAt.getTime() < 600000) throw new Error("Contract send is in progress. Try again shortly.");
      const term = buildTopUpTerm(input, Number(request.requestedAmount));
      const existing = request.newApplicationId
        ? await tx.application.findUnique({ where: { id: request.newApplicationId } }) : null;
      if (existing && (existing.offerSentAt || existing.offerStatus === "ACCEPTED" || existing.fundedAt)) {
        throw new Error("This contract has already been sent or signed. Its terms are locked.");
      }
      const source = await tx.application.findUnique({ where: { id: request.applicationId } });
      if (!source) throw new Error("Original application not found.");
      const data = {
        loanAmount: input.amount, loanTermMonths: input.durationWeeks, paymentFrequency: "WEEKLY",
        status: "APPROVED", approvedAt: new Date(), approvedBy: reviewer,
        offerStatus: "OFFERED", offeredMinAmount: input.amount, offeredMaxAmount: input.amount,
        offeredTermsJson: JSON.stringify([term]), offerToken: randomBytes(24).toString("hex"),
      };
      const child = existing
        ? await tx.application.update({ where: { id: existing.id }, data })
        : await tx.application.create({ data: {
            ...topUpSourceData(source), ...data, applicationCode: randomBytes(4).toString("hex").toUpperCase(),
          } });
      await tx.advanceTopUpRequest.update({ where: { id: request.id }, data: {
        newApplicationId: child.id, weeklyRate: input.weeklyRate, status: "APPROVED",
        reviewedAt: new Date(), reviewedBy: reviewer,
      } });
      return child.id;
    });
    await logAudit({ action: "OFFER_SET", entityType: "APPLICATION", entityId: childId,
      performedBy: session.user.email, details: { kind: "TOPUP_TERMS", requestId: input.requestId,
        amount: input.amount, weeklyRate: input.weeklyRate, durationWeeks: input.durationWeeks, notified: false } });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not prepare top-up offer." };
  }
}

export async function sendTopUpContract(requestId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  const request = await prisma.advanceTopUpRequest.findUnique({ where: { id: requestId }, include: { newApplication: true } });
  if (request?.status !== "APPROVED" || !request.newApplication || request.newApplication.offerStatus !== "OFFERED") {
    return { ok: false as const, error: "Prepare top-up terms before sending a contract." };
  }
  const { resendOfferNotification } = await import("@/actions/offers");
  return resendOfferNotification(request.newApplication.id);
}

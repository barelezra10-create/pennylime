"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type AdminTopUpRow = {
  id: string;
  requestedAmount: number;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export async function getTopUpRequestsForApplication(applicationId: string): Promise<AdminTopUpRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const rows = await prisma.advanceTopUpRequest.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    requestedAmount: Number(r.requestedAmount),
    status: r.status,
    adminNote: r.adminNote,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
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

  await prisma.advanceTopUpRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      adminNote: input.adminNote || null,
      reviewedBy: session.user.email,
      reviewedAt: new Date(),
    },
  });

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

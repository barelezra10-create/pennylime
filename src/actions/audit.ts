"use server";

import { prisma } from "@/lib/db";

export async function getAuditLogs(params?: {
  action?: string;
  entityType?: string;
  performedBy?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (params?.action) where.action = params.action;
  if (params?.entityType) where.entityType = params.entityType;
  if (params?.performedBy) where.performedBy = params.performedBy;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params?.limit || 50,
      skip: params?.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

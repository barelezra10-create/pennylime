import { prisma } from "@/lib/db";

export type AuditAction =
  | "APPROVE"
  | "REJECT"
  | "FUND"
  | "EDIT_INCOME"
  | "VIEW_SSN"
  | "CHANGE_SETTING"
  | "LOGIN"
  | "WAIVE_FEE"
  | "RETRY_PAYMENT"
  | "ADD_LATE_FEE"
  | "COLLECTIONS_ESCALATION"
  | "PAYMENT_RECEIVED"
  | "INITIATE_ACH";

export type AuditEntityType =
  | "APPLICATION"
  | "PAYMENT"
  | "LOAN_RULE";

export async function logAudit(params: {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  performedBy: string;
  details?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      performedBy: params.performedBy,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}

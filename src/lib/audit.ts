import { prisma } from "@/lib/db";

export type AuditAction =
  | "APPROVE"
  | "REJECT"
  | "FUND"
  | "EDIT_INCOME"
  | "VIEW_SSN"
  | "CHANGE_SETTING"
  | "LOGIN"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED_OUT"
  | "WAIVE_FEE"
  | "RETRY_PAYMENT"
  | "MANUAL_CHARGE_PAYMENT"
  | "ADD_LATE_FEE"
  | "COLLECTIONS_ESCALATION"
  | "PAYMENT_RECEIVED"
  | "INITIATE_ACH"
  | "OFFER_SET"
  | "OFFER_ACCEPTED"
  | "OFFER_NOTIFICATION_RESENT"
  | "AI_RISK_ANALYSIS"
  | "CONTRACT_CANCELED"
  | "PORTAL_PREVIEW_AS_CUSTOMER";

export type AuditEntityType =
  | "APPLICATION"
  | "PAYMENT"
  | "LOAN_RULE"
  | "ADMIN_USER";

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

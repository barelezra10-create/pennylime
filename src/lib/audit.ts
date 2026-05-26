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

// Keys (case-insensitive) whose VALUES get masked before being written to
// auditLog.details. Audit log is intentionally less-restricted than the
// Application table, so we must never let raw SSNs or full bank account
// numbers leak through. If a caller passes `details: { ssn: "123-45-6789" }`
// it lands as `{ ssn: "***" }` in storage.
const PII_KEYS = new Set([
  "ssn",
  "ssnraw",
  "ssn_raw",
  "ssnplain",
  "ssnencrypted",
  "ssnhash",
  "bankaccountnumber",
  "bankaccountnumbermanual",
  "accountnumber",
  "routingnumber",
  "dateofbirth",
  "dob",
  "plaidaccesstoken",
  "plaiduserToken",
  "password",
]);

function redactPII(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPII);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = typeof v === "string" && v.length > 4 ? `***${v.slice(-4)}` : "***";
      } else {
        out[k] = redactPII(v);
      }
    }
    return out;
  }
  return value;
}

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
      details: params.details ? JSON.stringify(redactPII(params.details)) : null,
    },
  });
}

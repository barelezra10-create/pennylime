export type SupportWorkspace = "active" | "collections";
export function accountWorkspace(account: { status: string; overdue: number; settlementStatus: string | null }): SupportWorkspace {
  return account.overdue > 0 || ["LATE", "COLLECTIONS", "DEFAULTED"].includes(account.status) || ["DRAFT", "SENT", "ACTIVE"].includes(account.settlementStatus || "")
    ? "collections" : "active";
}

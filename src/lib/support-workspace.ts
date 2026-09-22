export type SupportWorkspace = "active" | "collections";
export function accountWorkspace(account: { status: string; overdue: number; settlementStatus: string | null; workspaceOverride?: string | null }): SupportWorkspace {
  if (account.workspaceOverride === "active") return "active";
  return account.overdue > 0 || ["LATE", "COLLECTIONS", "DEFAULTED"].includes(account.status) || ["DRAFT", "SENT", "ACTIVE"].includes(account.settlementStatus || "")
    ? "collections" : "active";
}

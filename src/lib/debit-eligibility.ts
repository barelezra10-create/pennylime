/** Only a funded advance in a collectible lifecycle state may be debited. */
export const AUTOMATED_DEBIT_STATUSES = ["FUNDED", "ACTIVE", "REPAYING", "LATE"];
export function debitEligibilityError(app: {status:string;fundedAt:Date|string|null}|null): string|null {
  if (!app || ![...AUTOMATED_DEBIT_STATUSES,"COLLECTIONS","DEFAULTED"].includes(app.status)) return "This application is not eligible for payment collection.";
  if (!app.fundedAt) return "Payment collection is blocked because funding has not been recorded.";
  return null;
}

export const CLOSED_STATUSES = ["PAID_OFF", "REJECTED", "WITHDRAWN", "CANCELED", "CANCELLED"];
export function retentionDates(endedAt: Date) {
  const revokeAt = new Date(endedAt.getTime() + 30 * 86_400_000);
  const recordReviewAt = new Date(endedAt);
  recordReviewAt.setUTCFullYear(recordReviewAt.getUTCFullYear() + 7);
  return { revokeAt, recordReviewAt };
}
export function eligibleForPlaidRevocation(input: {
  status: string; endedAt: Date | null; legalHold: boolean; revokedAt: Date | null;
  hasOtherActiveRelationship: boolean; now?: Date;
}) {
  return CLOSED_STATUSES.includes(input.status) && !!input.endedAt && !input.legalHold && !input.revokedAt &&
    !input.hasOtherActiveRelationship && retentionDates(input.endedAt).revokeAt <= (input.now ?? new Date());
}

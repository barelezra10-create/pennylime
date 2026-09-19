import { describe, expect, it } from "vitest";
import { eligibleForPlaidRevocation, retentionDates } from "./retention-policy";
const base = { status: "PAID_OFF", endedAt: new Date('2026-01-01Z'), legalHold: false, revokedAt: null, hasOtherActiveRelationship: false, now: new Date('2026-02-01Z') };
describe('retention safeguards', () => {
  it('preserves active, held, unreviewed and shared relationships', () => {
    for (const patch of [{ status: 'ACTIVE' }, { status: 'COLLECTIONS' }, { status: 'DEFAULTED' }, { legalHold: true }, { endedAt: null }, { hasOtherActiveRelationship: true }, { revokedAt: new Date() }]) {
      expect(eligibleForPlaidRevocation({ ...base, ...patch })).toBe(false);
    }
  });
  it('waits 30 full days and uses explicit relationship end date', () => {
    expect(eligibleForPlaidRevocation({ ...base, now: new Date('2026-01-30T23:59:59Z') })).toBe(false);
    expect(eligibleForPlaidRevocation({ ...base, now: new Date('2026-01-31Z') })).toBe(true);
    expect(retentionDates(base.endedAt).recordReviewAt.toISOString()).toBe('2033-01-01T00:00:00.000Z');
  });
});

/**
 * Eastern Time helpers.
 *
 * Railway runs in UTC. PennyLime is a US business, so:
 *
 *   - "Today" for an admin/borrower means today in US Eastern Time,
 *     not "the UTC date right now". After ~8 PM EDT the UTC date is
 *     already tomorrow, which was making the NextDuePill render
 *     "DUE TODAY" for payments actually due tomorrow.
 *
 *   - ACH cutoffs, NACHA business days, late-fee anchors — all of
 *     these are quoted in Eastern by Fed convention.
 *
 * These helpers anchor day-level comparisons to America/New_York
 * without pulling in date-fns-tz.
 */

const TZ = "America/New_York";

/**
 * Return the YYYY-MM-DD string of a Date in Eastern Time.
 * Use when you need to compare or label *which calendar day* something
 * falls on for a US audience, regardless of the host timezone.
 */
export function easternDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Integer day difference (a - b) anchored to Eastern Time.
 * Negative means b is in the future, positive means b is in the past.
 *
 * Both arguments are coerced to their Eastern calendar date first,
 * so 11:59 PM UTC on Jun 8 (= 7:59 PM EDT) compared to 12:01 AM UTC
 * on Jun 9 (= 8:01 PM EDT) returns 0 days — same Eastern calendar
 * day, even though they straddle UTC midnight.
 */
export function easternDayDiff(a: Date, b: Date): number {
  const ad = Date.parse(easternDateString(a) + "T12:00:00Z");
  const bd = Date.parse(easternDateString(b) + "T12:00:00Z");
  return Math.round((ad - bd) / 86_400_000);
}

/**
 * True when `d` falls on or before today (Eastern). Useful for
 * "due today or earlier" predicates.
 */
export function isOnOrBeforeEasternToday(d: Date): boolean {
  return easternDayDiff(d, new Date()) <= 0;
}

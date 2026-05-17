/**
 * Picks the best day-of-week to ACH debit a borrower, based on their
 * historical income deposit pattern. The "best" day is one business
 * day AFTER the day-of-week that consistently lands the largest
 * income — that way the ACH debit clears (typically 1-3 business
 * days) right when the freshest paycheck just hit, maximizing the
 * chance that the balance is non-zero when our debit settles.
 *
 * Avoids Sundays (banks don't process ACH on weekends; ACH would
 * sit in queue until Monday anyway). Returns 0=Sunday … 6=Saturday,
 * or null when there's not enough data to make a confident pick.
 */

export type DepositForAnalysis = {
  date: string; // ISO yyyy-mm-dd
  amount: number;
  classification?: "income" | "transfer" | "refund" | "unknown" | null;
};

export type BestChargeDay = {
  dayOfWeek: number; // 0=Sun … 6=Sat
  dayName: string;
  reason: string;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function computeBestChargeDay(
  deposits: DepositForAnalysis[],
): BestChargeDay | null {
  if (!deposits || deposits.length === 0) return null;

  // Sum INCOME deposits by day-of-week. UTC parsing keeps day stable
  // regardless of server timezone.
  const totalsByDay = [0, 0, 0, 0, 0, 0, 0];
  const countsByDay = [0, 0, 0, 0, 0, 0, 0];
  let totalIncome = 0;

  for (const d of deposits) {
    if (d.classification && d.classification !== "income") continue;
    const dt = new Date(`${d.date}T00:00:00Z`);
    if (isNaN(dt.getTime())) continue;
    const dow = dt.getUTCDay();
    const amt = Math.abs(d.amount);
    totalsByDay[dow] += amt;
    countsByDay[dow]++;
    totalIncome += amt;
  }

  if (totalIncome === 0) return null;

  // Pick the day-of-week with the largest income total.
  let bestIncomeDay = 0;
  let bestIncomeAmount = 0;
  for (let i = 0; i < 7; i++) {
    if (totalsByDay[i] > bestIncomeAmount) {
      bestIncomeAmount = totalsByDay[i];
      bestIncomeDay = i;
    }
  }

  // Charge day is the day RIGHT AFTER the biggest income day. Skip
  // Saturday/Sunday — ACH doesn't process on weekends, would just
  // queue until Monday, but Monday morning is often a thin balance
  // window because customers spend over the weekend. So we skip
  // to Tuesday if charge day lands on Saturday/Sunday.
  let chargeDay = (bestIncomeDay + 1) % 7;
  if (chargeDay === 0 /* Sunday */ || chargeDay === 6 /* Saturday */) {
    chargeDay = 2; // Tuesday — money has had a few days to settle + spend
  }

  const pct = Math.round((bestIncomeAmount / totalIncome) * 100);
  return {
    dayOfWeek: chargeDay,
    dayName: DAY_NAMES[chargeDay],
    reason: `Largest income lands on ${DAY_NAMES[bestIncomeDay]}s (${pct}% of total income, ${countsByDay[bestIncomeDay]} deposits over the period). Debit fires the next business day so ACH settles while balance is fresh.`,
  };
}

/**
 * Given a base date and a target day-of-week, return the next
 * occurrence of that day on or after the base date.
 */
export function nextOccurrenceOfDay(base: Date, targetDay: number): Date {
  const result = new Date(base);
  const currentDay = result.getDay();
  const diff = (targetDay - currentDay + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

import { prisma } from "@/lib/db";

/**
 * Global automated-payment pause.
 *
 * When the `payments_paused_until` LoanRule holds a future date, every
 * automated money-movement cron (payment-processor, payment-retry, reminders,
 * late-fees, collections) skips its run. Clearing the rule, or letting the date
 * pass, resumes normal processing. This is reversible and touches no payment
 * data, so it is safe to toggle.
 *
 * Returns the resume date while a pause is active, otherwise null.
 */
export async function paymentsPausedUntil(now: Date = new Date()): Promise<Date | null> {
  const rule = await prisma.loanRule.findFirst({ where: { key: "payments_paused_until" } });
  if (!rule?.value) return null;
  const until = new Date(rule.value);
  if (isNaN(until.getTime())) return null;
  return now < until ? until : null;
}

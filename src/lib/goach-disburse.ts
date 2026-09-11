import "server-only";
import { prisma } from "@/lib/db";
import { createTransaction } from "@/lib/goach";

export type GoachCredit = { uuid: string; amountCents: number; status: string };

const CAP_CENTS = 100_000; // GoACH caps a single ACH credit at $1,000.

/**
 * Split a disbursement total into even chunks each <= $1,000. Even split keeps
 * every chunk comfortably under the cap (e.g. $1,500 -> 750 + 750, $2,000 ->
 * 1000 + 1000) instead of 1000 + remainder. Amounts <= $1,000 stay a single
 * credit. Any leftover cents are spread one-per-chunk so the parts sum exactly.
 */
export function splitDisbursementCents(totalCents: number): number[] {
  if (totalCents <= CAP_CENTS) return [totalCents];
  const n = Math.ceil(totalCents / CAP_CENTS);
  const base = Math.floor(totalCents / n);
  const chunks = Array<number>(n).fill(base);
  let rem = totalCents - base * n;
  for (let i = 0; rem > 0; i = (i + 1) % n, rem--) chunks[i] += 1;
  return chunks;
}

/**
 * Money-safe split disbursement. Sends only the not-yet-disbursed remainder
 * (total minus what already went out per goachCreditsJson), persisting each
 * successful credit immediately so a retry can never re-send a credit that
 * already cleared — the borrower is never double-paid. On a mid-way chunk
 * failure, whatever succeeded stays recorded and the caller can retry to send
 * just the rest.
 */
export async function disburseInChunks(input: {
  applicationId: string;
  bankAccountUuid: string;
  totalCents: number;
  existingCreditsJson: string | null;
  descriptor?: string;
}): Promise<
  | { ok: true; credits: GoachCredit[]; sentThisRun: number; depositDate: string | null }
  | { ok: false; error: string; credits: GoachCredit[] }
> {
  let credits: GoachCredit[] = [];
  try {
    credits = input.existingCreditsJson ? (JSON.parse(input.existingCreditsJson) as GoachCredit[]) : [];
  } catch {
    credits = [];
  }
  const alreadyCents = credits.reduce((s, c) => s + c.amountCents, 0);
  const remainingCents = input.totalCents - alreadyCents;
  if (remainingCents <= 0) return { ok: true, credits, sentThisRun: 0, depositDate: null };

  const chunks = splitDisbursementCents(remainingCents);
  let sentThisRun = 0;
  // Latest deposit/effective date across the credits — the advance isn't fully
  // in the borrower's hands until the last chunk deposits. Prefer deposit_date;
  // fall back to effective_date (the ACH settlement date).
  let depositAnchor: string | null = null;
  for (const chunkCents of chunks) {
    const tx = await createTransaction({
      bankAccountUuid: input.bankAccountUuid,
      amountCents: chunkCents,
      type: "Credit",
      descriptor: input.descriptor ?? "PENNYLIME ADV",
    });
    if (!tx.ok) {
      await prisma.application
        .update({ where: { id: input.applicationId }, data: { goachCreditsJson: JSON.stringify(credits) } })
        .catch(() => {});
      return { ok: false, error: tx.error, credits };
    }
    credits.push({ uuid: tx.uuid, amountCents: chunkCents, status: tx.status });
    sentThisRun++;
    const d = tx.depositDate ?? tx.effectiveDate;
    if (d && (!depositAnchor || d > depositAnchor)) depositAnchor = d; // ISO YYYY-MM-DD sorts lexically
    // Persist after EACH success — this is the double-pay guard for retries.
    await prisma.application.update({
      where: { id: input.applicationId },
      data: {
        goachCreditsJson: JSON.stringify(credits),
        // Parse as UTC noon so the calendar date is stable across timezones.
        ...(depositAnchor ? { goachDepositDate: new Date(`${depositAnchor}T12:00:00Z`) } : {}),
      },
    });
  }
  return { ok: true, credits, sentThisRun, depositDate: depositAnchor };
}

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sweepNsfRolls } from "@/lib/nsf-roll-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Dedicated NSF roll-to-end sweep. Separate from payment-status (which polls
 * every pending payment against the ACH processor and can time out before it
 * reaches the roll step) so the roll always runs, fast.
 *
 * ?dryRun=1 reports what WOULD happen (how many roll vs go to Collections)
 * without writing to the DB or texting/emailing anyone — use it to preview the
 * backlog before turning the real run on.
 */
async function run(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await sweepNsfRolls(100, { dryRun });
  return NextResponse.json(result);
}

export const POST = run;
export const GET = run;

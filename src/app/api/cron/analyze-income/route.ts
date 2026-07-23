import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { analyzeAndStoreIncome } from "@/lib/analyze-income";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Pre-analyze pending applications' income the moment they land, so an admin
// never has to click "Re-analyze" and wait. The submit-time parse already
// does this best-effort; this sweep is the safety net that catches any that
// failed inline (e.g. a transient Gemini error) plus the existing backlog.
//
// Underwriting stages only — no point analyzing funded/rejected records.
const PENDING_STATUSES = ["PENDING", "APPLICANT", "APPROVED", "OFFER_ACCEPTED"];

// Cap per run so a single invocation stays fast; the backlog drains over
// successive runs. Analyses run sequentially to stay gentle on Gemini limits.
const BATCH = 8;

async function runSweep() {
  const candidates = await prisma.application.findMany({
    where: {
      status: { in: PENDING_STATUSES },
      incomeByPlatformJson: null,
      documents: { some: { documentType: "BANK_STATEMENT_90D" } },
    },
    select: { id: true, applicationCode: true },
    orderBy: { createdAt: "desc" },
    take: BATCH,
  });

  const results: Array<{ id: string; code: string | null; ok: boolean; info: string }> = [];
  for (const app of candidates) {
    try {
      const r = await analyzeAndStoreIncome(app.id);
      results.push({
        id: app.id,
        code: app.applicationCode ?? null,
        ok: r.ok,
        info: r.ok ? `${r.deposits} deposits` : r.error,
      });
    } catch (err) {
      results.push({
        id: app.id,
        code: app.applicationCode ?? null,
        ok: false,
        info: err instanceof Error ? err.message : "analyze threw",
      });
    }
  }

  const analyzed = results.filter((r) => r.ok).length;
  return { scanned: candidates.length, analyzed, results };
}

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  return NextResponse.json(await runSweep());
}

// Allow GET too (some schedulers only issue GETs); same auth.
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  return NextResponse.json(await runSweep());
}

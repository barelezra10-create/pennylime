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

// Pull a generous candidate set but stop starting new analyses once we near
// the time budget, so a single invocation always returns cleanly (heavy,
// deposit-dense statements can each take tens of seconds). The backlog drains
// over successive runs; whatever finished is persisted per-app.
const BATCH = 20;
const DEADLINE_MS = 240_000;

async function runSweep() {
  const started = Date.now();
  const candidates = await prisma.application.findMany({
    where: {
      status: { in: PENDING_STATUSES },
      // Missing either the income breakdown or the monthly P&L.
      OR: [{ incomeByPlatformJson: null }, { monthlyPnlJson: null }],
      documents: { some: { documentType: "BANK_STATEMENT_90D" } },
    },
    select: { id: true, applicationCode: true },
    orderBy: { createdAt: "desc" },
    take: BATCH,
  });

  const results: Array<{ id: string; code: string | null; ok: boolean; info: string }> = [];
  for (const app of candidates) {
    if (Date.now() - started > DEADLINE_MS) break; // stay under the request budget
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

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { refreshBankBalance } from "@/lib/refresh-bank-balance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily balance refresh for accounts in the default funnel. Collections works
// these accounts by hand, so a fresh bank balance per day tells them whether
// there's money in the account to actually collect. Only Plaid-linked accounts
// have a live balance; statement-only accounts are skipped.
const STATUSES = ["COLLECTIONS", "DEFAULTED", "LATE"];
const DEADLINE_MS = 240_000;

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const started = Date.now();
  const apps = await prisma.application.findMany({
    where: { status: { in: STATUSES }, plaidAccessToken: { not: null } },
    select: { id: true, applicationCode: true },
    orderBy: { lastPlaidRefresh: "asc" }, // stalest first
  });

  let refreshed = 0;
  const failed: Array<{ code: string | null; error: string }> = [];
  for (const app of apps) {
    if (Date.now() - started > DEADLINE_MS) break;
    const r = await refreshBankBalance(app.id);
    if (r.ok) refreshed++;
    else failed.push({ code: app.applicationCode ?? null, error: r.error });
  }

  return NextResponse.json({ scanned: apps.length, refreshed, failed });
}

export const POST = run;
export const GET = run;

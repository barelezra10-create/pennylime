import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { previousEasternDateString, sendDailyRevenueReportForDate } from "@/lib/daily-revenue";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const date = previousEasternDateString();
  const result = await sendDailyRevenueReportForDate(date);
  return NextResponse.json({ ok: result.failed === 0, date, ...result }, { status: result.failed ? 502 : 200 });
}

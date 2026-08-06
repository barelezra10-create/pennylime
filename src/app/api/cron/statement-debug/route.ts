import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { parseStatementsWithAI } from "@/lib/bank-statement-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Diagnostic: parse each of an application's bank-statement PDFs INDIVIDUALLY
 * and report the real date range + deposit coverage of each, so we can see
 * whether a statement spans multiple months but only part is being extracted
 * (vs. simply fewer statements uploaded). Cron-secret protected; no writes.
 *   GET /api/cron/statement-debug?applicationId=<id>
 */
async function run(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });

  const docs = await prisma.document.findMany({
    where: { applicationId, documentType: "BANK_STATEMENT_90D" },
    orderBy: { createdAt: "asc" },
    select: { fileName: true, mimeType: true, fileSize: true, storagePath: true },
  });

  const perFile = [];
  for (const doc of docs) {
    try {
      const buffer = await storage.read(doc.storagePath);
      const parsed = await parseStatementsWithAI([{ filename: doc.fileName, buffer, mimeType: doc.mimeType }]);
      const incomeDates = (parsed.deposits ?? [])
        .filter((d) => (d.classification ?? "income") === "income" && Number(d.amount) > 0)
        .map((d) => d.date)
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s || ""))
        .sort();
      const months = [...new Set(incomeDates.map((d) => d.slice(0, 7)))];
      perFile.push({
        file: doc.fileName,
        sizeKB: Math.round(doc.fileSize / 1024),
        statementPeriod: [parsed.statementPeriodStart, parsed.statementPeriodEnd],
        incomeDeposits: incomeDates.length,
        depositDateRange: incomeDates.length ? [incomeDates[0], incomeDates[incomeDates.length - 1]] : [],
        monthsWithIncome: months,
        allDeposits: parsed.deposits?.length ?? 0,
        expenses: parsed.expenses?.length ?? 0,
        nsfCount: parsed.nsfCount,
        confidence: parsed.confidence,
        notes: parsed.notes,
      });
    } catch (err) {
      perFile.push({ file: doc.fileName, error: err instanceof Error ? err.message : "parse failed" });
    }
  }

  return NextResponse.json({ applicationId, docCount: docs.length, perFile });
}

export const POST = run;
export const GET = run;

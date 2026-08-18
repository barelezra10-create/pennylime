import { NextRequest, NextResponse } from "next/server";
import { parseStatementsWithAI } from "@/lib/bank-statement-parser";
import { evaluateStatementGate } from "@/lib/statement-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// PDF statements only. Screenshots/photos can't be reliably parsed and were the
// source of unreadable "no deposits" applications, so reject them at the gate.
const ALLOWED_TYPES = ["application/pdf"];

/**
 * Validate the applicant's uploaded bank statements at the document step,
 * BEFORE they can finish the funnel. Two hard gates:
 *   1. Coverage — the statements must actually cover the last ~90 days.
 *   2. Income — a gig worker's income on the platform(s) they listed must be
 *      at least $1,500/month.
 *
 * Parses in-memory only (no DB write, no storage). Fails OPEN on parser/other
 * errors so a real applicant is never blocked by our own hiccup; the admin
 * still reviews and the submit-time finalize re-parses.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const platforms = String(formData.get("platforms") || "");
    const workerType = String(formData.get("workerType") || "INDEPENDENT_CONTRACTOR");

    if (files.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: "missing",
        message: "Please upload your last 90 days of bank statements.",
      });
    }

    const pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      pdfs.push({ filename: file.name, buffer, mimeType: file.type });
    }
    if (pdfs.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: "missing",
        message: "Please upload your bank statements as PDF files (not screenshots). Download the official PDF from your bank.",
      });
    }

    let parsed;
    try {
      parsed = await parseStatementsWithAI(pdfs);
    } catch (err) {
      console.error("[validate-statements] parse failed, failing open:", err);
      return NextResponse.json({ ok: true, note: "unparsed" });
    }

    const verdict = evaluateStatementGate({
      deposits: parsed.deposits ?? [],
      expenses: parsed.expenses ?? [],
      platforms: platforms || null,
      workerType,
    });
    return NextResponse.json(verdict);
  } catch (err) {
    console.error("[validate-statements] unexpected error, failing open:", err);
    return NextResponse.json({ ok: true, note: "error" });
  }
}

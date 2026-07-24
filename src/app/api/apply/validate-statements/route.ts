import { NextRequest, NextResponse } from "next/server";
import { parseStatementsWithAI } from "@/lib/bank-statement-parser";
import { incomeByPlatform } from "@/lib/income-by-platform";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
];

// Gates for the apply funnel's document step.
const MIN_COVERAGE_DAYS = 75; // statements must span ~the last 90 days (slack for month boundaries)
const MIN_MONTHLY_INCOME = 1500; // minimum monthly income on the listed platform to qualify

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
        message: "Please upload PDF, image, or CSV bank statements.",
      });
    }

    let parsed;
    try {
      parsed = await parseStatementsWithAI(pdfs);
    } catch (err) {
      console.error("[validate-statements] parse failed, failing open:", err);
      return NextResponse.json({ ok: true, note: "unparsed" });
    }

    const deposits = parsed.deposits ?? [];
    const allDates = [
      ...deposits.map((d) => d.date),
      ...(parsed.expenses ?? []).map((e) => e.date),
    ]
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""))
      .sort();

    // 1) 90-day coverage — only enforce when we could actually read dates.
    if (allDates.length >= 2) {
      const first = new Date(allDates[0]).getTime();
      const last = new Date(allDates[allDates.length - 1]).getTime();
      const coverageDays = Math.round((last - first) / 86400000);
      if (coverageDays < MIN_COVERAGE_DAYS) {
        return NextResponse.json({
          ok: false,
          reason: "coverage",
          coverageDays,
          message: `Your statements only cover about ${coverageDays} days. Please upload bank statements that cover the full last 90 days (3 months).`,
        });
      }
    }

    // 2) Income gate — gig workers only (business owners are underwritten on
    //    card-processor settlements, not a gig platform).
    const isBusiness = workerType === "BUSINESS_OWNER";
    if (!isBusiness) {
      const breakdown = incomeByPlatform(deposits, platforms || null);
      const months = Math.max(1, breakdown.months.length);
      const listed = breakdown.platforms.filter((p) => p.isListed);
      const listedTotal = listed.reduce((s, p) => s + p.total, 0);
      // If we could not attribute any income to a listed platform, fall back to
      // total income so an attribution miss does not wrongly reject someone.
      const monthly = (listed.length > 0 ? listedTotal : breakdown.grandTotal) / months;
      if (monthly < MIN_MONTHLY_INCOME) {
        const label = listed.length > 0 ? listed.map((p) => p.platform).join(" + ") : "your gig work";
        return NextResponse.json({
          ok: false,
          reason: "income",
          monthly: Math.round(monthly),
          message: `Based on your statements, your income from ${label} is about $${Math.round(monthly).toLocaleString()}/month. We currently need at least $1,500/month on your platform to offer an advance.`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[validate-statements] unexpected error, failing open:", err);
    return NextResponse.json({ ok: true, note: "error" });
  }
}

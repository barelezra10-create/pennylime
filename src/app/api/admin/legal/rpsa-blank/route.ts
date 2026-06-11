import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { renderHtmlToPdf } from "@/lib/pdf/agreement-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Blank Receivables Purchase and Sale Agreement template.
 *
 * Returns either the raw markdown source (?format=md) or a rendered
 * PDF (default) with placeholders intact, so admin can share the
 * unfilled contract with banks, processors, or legal review during
 * the Increase wind-down.
 *
 * Admin-only — same auth gate as the partner deck route.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  const mdPath = path.join(
    process.cwd(),
    "docs",
    "legal",
    "2026-05-17-receivables-purchase-agreement.md",
  );
  let md: string;
  try {
    md = await fs.readFile(mdPath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "read failed";
    return new NextResponse(`Template not found: ${msg}`, { status: 500 });
  }

  if (format === "md") {
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="PennyLime-RPSA-Template.md"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = (await marked.parse(md)) as string;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10.5pt; color: #0a0a0a; line-height: 1.55; }
  h1 { font-size: 18pt; margin: 0 0 8pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; color: #0a0a0a; }
  h3 { font-size: 11.5pt; margin: 14pt 0 4pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
  li { margin: 0 0 4pt; }
  strong { color: #0a0a0a; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  th, td { border: 1px solid #d4d4d8; padding: 6pt 8pt; text-align: left; font-size: 10pt; }
  th { background: #f4f4f5; }
  .cover { padding: 8pt 0 14pt; border-bottom: 2px solid #15803d; margin-bottom: 18pt; }
  .cover-label { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin: 0 0 4pt; }
  .cover-title { font-size: 22pt; font-weight: 700; margin: 0; }
  .cover-meta { font-size: 9.5pt; color: #52525b; margin: 6pt 0 0; }
</style>
</head>
<body>
  <div class="cover">
    <p class="cover-label">PennyLime — Blank Template</p>
    <p class="cover-title">Receivables Purchase and Sale Agreement</p>
    <p class="cover-meta">Unfilled reference copy. Placeholder fields (e.g. {{firstName}}, {{approvedAmount}}, {{durationWeeks}}) are populated per-borrower at offer acceptance. Exported ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
  </div>
  ${body}
</body>
</html>`;

  try {
    const pdf = await renderHtmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="PennyLime-RPSA-Template.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF generation failed";
    return new NextResponse(`PDF generation failed: ${msg}`, { status: 500 });
  }
}

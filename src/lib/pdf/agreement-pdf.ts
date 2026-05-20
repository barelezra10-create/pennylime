import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

type Term = {
  weeklyRemittance: number;
  durationWeeks: number;
  disbursedAmount: number;
  totalCostOfCapital: number;
  processingFee: number;
  isRecommended: boolean;
};

type FillParams = {
  firstName: string;
  lastName: string;
  fullAddress: string | null;
  bankName: string | null;
  bankAccountMask: string | null;
  accountSubtype: string | null;
  approvedAmount: number;
  recommendedTerm: Term;
  // When the borrower has accepted, we render an "Executed" version
  // of the agreement instead of the pre-acceptance preview: real plan
  // (not just the recommended one), real schedule, and a signed-by
  // block at the bottom with name + timestamp + IP + UA. Showing the
  // ink-equivalent of their click-to-sign.
  signed?: {
    signedName: string | null;
    signedAt: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    scrolledToBottom: boolean;
    realSchedule: Array<{ paymentNumber: number; date: string; amount: number }>;
    agreementVersion: string | null;
  };
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildScheduleRows(amount: number, term: Term): Array<{
  paymentNumber: number;
  date: string;
  amount: number;
}> {
  // Mirror the client-side computeSchedule (no preferredChargeDay
  // snapping here — the PDF is a preview of the recommended plan).
  const firstDue = new Date();
  firstDue.setDate(firstDue.getDate() + 7);
  const ratio = term.disbursedAmount > 0 ? amount / term.disbursedAmount : 1;
  const weekly = Math.round(term.weeklyRemittance * ratio * 100) / 100;
  const rows = [];
  for (let i = 0; i < term.durationWeeks; i++) {
    const due = new Date(firstDue);
    due.setDate(due.getDate() + 7 * i);
    rows.push({
      paymentNumber: i + 1,
      date: due.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      amount: weekly,
    });
  }
  return rows;
}

/**
 * Loads the canonical agreement markdown, renders to HTML, and
 * substitutes every [Placeholder] with the borrower's data — same
 * substitution map the offer page uses client-side. Returns a full
 * standalone HTML document ready for puppeteer.
 */
export async function buildFilledAgreementHtml(params: FillParams): Promise<string> {
  const mdPath = path.join(
    process.cwd(),
    "docs",
    "legal",
    "2026-05-17-receivables-purchase-agreement.md",
  );
  const md = await fs.readFile(mdPath, "utf8");
  let html = (await marked.parse(md)) as string;

  const fullName = `${params.firstName} ${params.lastName}`.trim();
  const todayLong = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const accountTypeLabel = (() => {
    const s = params.accountSubtype?.toLowerCase();
    if (!s) return "Checking";
    if (s.includes("saving")) return "Savings";
    return "Checking";
  })();
  // Signed mode uses the actual persisted schedule (from AchAuthorization
  // / Payment rows). Preview mode computes one from the recommended plan.
  const schedule = params.signed?.realSchedule
    ? params.signed.realSchedule.map((p) => ({
        paymentNumber: p.paymentNumber,
        date: p.date,
        amount: p.amount,
      }))
    : buildScheduleRows(params.approvedAmount, params.recommendedTerm);
  const totalDebit = schedule.reduce((s, p) => s + p.amount, 0);
  // Scale the recommended-plan weekly remittance to whatever amount
  // they actually accepted, so the cover + agreement body show the
  // numbers that match the schedule.
  const effectiveWeekly = schedule[0]?.amount ?? params.recommendedTerm.weeklyRemittance;

  const subs: Record<string, string> = {
    "[Acceptance Date]": todayLong,
    "[Merchant Legal Name]": fullName || "—",
    "[Merchant Address]": params.fullAddress ?? "—",
    "[Owner Legal Name]": fullName || "—",
    "[Account Holder Name]": fullName || "—",
    "[Bank Name]": params.bankName ?? "—",
    "[Last 4]": params.bankAccountMask ?? "xxxx",
    "[Routing Number]": "On file with PennyLime",
    "[Checking / Savings]": accountTypeLabel,
    "[Disbursed Amount]": fmt(params.approvedAmount),
    "[Total Receivables]": fmt(totalDebit),
    "[Specified Percentage]": "100",
    "[Weekly Remittance]": fmt(effectiveWeekly),
    "[Origination Fee]": fmt(params.recommendedTerm.processingFee),
  };
  for (const [token, value] of Object.entries(subs)) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(esc, "g"), value);
  }

  const realRows = schedule
    .map(
      (p) =>
        `<tr><td>${p.paymentNumber}</td><td>${p.date}</td><td>$${fmt(p.amount)}</td></tr>`,
    )
    .join("");
  html = html.replace(
    /<tbody>(?:\s*<tr>\s*<td>(?:1|2|…|N)<\/td>[\s\S]*?<\/tr>\s*)+<\/tbody>/,
    `<tbody>${realRows}</tbody>`,
  );

  // Signed footer — appended when this is the executed version.
  const isExecuted = !!params.signed;
  const signedFooter = isExecuted
    ? `
  <div class="signed-block">
    <h3 style="margin-top:0">Borrower Electronic Signature</h3>
    <p class="signed-name">${params.signed!.signedName ?? fullName}</p>
    <p class="signed-meta">
      <strong>Signed:</strong> ${params.signed!.signedAt ? new Date(params.signed!.signedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "—"}
      &nbsp;·&nbsp; <strong>IP:</strong> ${params.signed!.ipAddress ?? "—"}
      &nbsp;·&nbsp; <strong>Scroll-to-end confirmed:</strong> ${params.signed!.scrolledToBottom ? "Yes" : "No"}
      ${params.signed!.agreementVersion ? `&nbsp;·&nbsp; <strong>Version:</strong> ${params.signed!.agreementVersion}` : ""}
    </p>
    ${params.signed!.userAgent ? `<p class="signed-ua">User-Agent: ${params.signed!.userAgent}</p>` : ""}
    <p class="signed-recital">
      By checking the consent boxes and clicking "Accept and Authorize" on the PennyLime offer page, Merchant adopted this electronic action as Merchant's signature under the federal E-SIGN Act and Florida's Uniform Electronic Transaction Act, with the same legal effect as an ink signature.
    </p>
  </div>`
    : "";

  // Wrap in a print-friendly standalone document.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PennyLime — ${isExecuted ? "Signed" : "Offer"} Agreement for ${fullName}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 22pt; color: #0a0a0a; border-bottom: 2px solid #15803d; padding-bottom: 8px; margin: 0 0 16px; letter-spacing: -0.02em; }
  h2 { font-size: 13pt; color: #15803d; margin: 22px 0 8px; }
  h3 { font-size: 11pt; color: #0a0a0a; margin: 14px 0 6px; }
  p, li { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 9px; text-align: left; }
  th { background: #f4f4f5; font-weight: 700; }
  blockquote { border-left: 3px solid #15803d; background: #f0fdf4; padding: 10px 14px; margin: 12px 0; color: #14532d; font-size: 10pt; }
  strong { color: #0a0a0a; }
  hr { border: none; border-top: 1px solid #d4d4d8; margin: 18px 0; }
  .cover {
    background: #f0fdf4;
    border: 2px solid #15803d;
    border-radius: 8px;
    padding: 18px 20px;
    margin: 0 0 22px;
  }
  .cover-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #15803d; font-weight: 700; margin: 0 0 2px; }
  .cover-amount { font-size: 28pt; font-weight: 800; color: #0a0a0a; margin: 0; letter-spacing: -0.02em; }
  .cover-row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 10pt; color: #52525b; }
  .cover-row strong { color: #0a0a0a; }
  .signed-block { margin-top: 28px; padding: 18px 20px; border: 2px solid #15803d; border-radius: 8px; background: #f0fdf4; page-break-inside: avoid; }
  .signed-name { font-family: 'Caveat', 'Brush Script MT', cursive; font-size: 26pt; color: #0a0a0a; margin: 4px 0 8px; line-height: 1.1; }
  .signed-meta { font-size: 10pt; color: #52525b; margin: 0 0 4px; }
  .signed-ua { font-size: 8pt; color: #71717a; font-family: ui-monospace, Menlo, monospace; word-break: break-all; margin: 0 0 8px; }
  .signed-recital { font-size: 9pt; color: #14532d; margin: 8px 0 0; line-height: 1.4; }
</style>
</head>
<body>
  <div class="cover">
    <p class="cover-label">${isExecuted ? "Executed agreement for" : "Approved offer for"} ${fullName || "—"}</p>
    <p class="cover-amount">$${fmt(params.approvedAmount)}</p>
    <div class="cover-row">
      <span>${isExecuted ? "Accepted plan" : "Recommended plan"}</span>
      <span><strong>${params.recommendedTerm.durationWeeks} weeks</strong> · <strong>$${fmt(effectiveWeekly)}</strong>/week · Total <strong>$${fmt(totalDebit)}</strong></span>
    </div>
  </div>
  ${html}
  ${signedFooter}
</body>
</html>`;
}

/**
 * Renders a complete HTML document to a PDF buffer.
 *
 * Uses full `puppeteer` (downloads Chrome for Testing at install time)
 * instead of `puppeteer-core` + `@sparticuz/chromium-min`. The
 * sparticuz binary kept failing on Railway with missing system libs
 * (libnss3.so etc.) because Nixpacks' default image doesn't include
 * them. Full puppeteer ships a more self-contained Chromium that
 * works out of the box.
 *
 * Trade-off: ~280MB Chromium binary in the build. Worth it for a
 * "just works" PDF pipeline on Railway.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  // Dynamic import so client-side bundles don't drag puppeteer.
  const puppeteer = (await import("puppeteer")).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  try {
    const page = await browser.newPage();
    // puppeteer v24 narrowed setContent's waitUntil typings — "load"
    // is fine for our static HTML (no external resources to wait for).
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

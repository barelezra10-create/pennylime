import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { renderHtmlToPdf } from "./agreement-pdf";

const COLORS = {
  green: "#15803d",
  greenDark: "#0d3320",
  greenDeep: "#166534",
  lime: "#a3e635",
  cream: "#fafaf7",
  ink: "#0a0a0a",
  mute: "#52525b",
  faint: "#a1a1aa",
  line: "#e4e4e7",
  palegreen: "#f0fdf4",
};

async function loadLogoDataUri(): Promise<string> {
  try {
    const buf = await fs.readFile(
      path.join(process.cwd(), "public", "lime-mark-256.png"),
    );
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function fmtMoney(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (opts.compact && n >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type MonthRow = {
  month: string;
  funded: number;
  capital: number;
  revenue: number;
  profit: number;
};

// Unit economics (5%/week × 8 weeks = 40% factor rate, 25% default, $100 CAC):
//   capital per loan = $2,500
//   expected revenue per loan (fees after default) = 0.75 × $1,000 = $750
//   net contribution per loan (after default loss + CAC) = $25
const RAMP: MonthRow[] = [
  { month: "May 2026", funded: 5, capital: 12_500, revenue: 3_750, profit: 125 },
  { month: "Jun 2026", funded: 15, capital: 37_500, revenue: 11_250, profit: 375 },
  { month: "Jul 2026", funded: 30, capital: 75_000, revenue: 22_500, profit: 750 },
  { month: "Aug 2026", funded: 60, capital: 150_000, revenue: 45_000, profit: 1_500 },
  { month: "Sep 2026", funded: 100, capital: 250_000, revenue: 75_000, profit: 2_500 },
  { month: "Oct 2026", funded: 150, capital: 375_000, revenue: 112_500, profit: 3_750 },
  { month: "Nov 2026", funded: 200, capital: 500_000, revenue: 150_000, profit: 5_000 },
  { month: "Dec 2026", funded: 250, capital: 625_000, revenue: 187_500, profit: 6_250 },
];

const TOTAL = RAMP.reduce(
  (acc, r) => ({
    funded: acc.funded + r.funded,
    capital: acc.capital + r.capital,
    revenue: acc.revenue + r.revenue,
    profit: acc.profit + r.profit,
  }),
  { funded: 0, capital: 0, revenue: 0, profit: 0 },
);

function buildDeckHtml(logoDataUri: string): string {
  const styles = `
    @page { size: Letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: ${COLORS.ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 8.5in; height: 11in; padding: 0.7in 0.75in; page-break-after: always; position: relative; background: white; }
    .page:last-child { page-break-after: auto; }
    .footer { position: absolute; left: 0.75in; right: 0.75in; bottom: 0.45in; display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: ${COLORS.faint}; }
    .footer .mark { display: flex; align-items: center; gap: 6px; }
    .footer .mark img { width: 14px; height: 14px; }
    h1, h2, h3 { font-weight: 700; letter-spacing: -0.01em; }
    h1 { font-size: 30pt; line-height: 1.1; }
    h2 { font-size: 18pt; color: ${COLORS.greenDeep}; }
    h3 { font-size: 12pt; color: ${COLORS.mute}; text-transform: uppercase; letter-spacing: 0.08em; }
    p { font-size: 11pt; line-height: 1.55; color: ${COLORS.mute}; }
    .lead { font-size: 13pt; color: ${COLORS.ink}; line-height: 1.45; }

    /* Cover */
    .cover { background: ${COLORS.greenDark}; color: white; padding: 0.85in 0.85in; }
    .cover .logo-row { display: flex; align-items: center; gap: 12px; }
    .cover .logo-row img { width: 38px; height: 38px; }
    .cover .logo-row span { font-size: 14pt; font-weight: 700; letter-spacing: -0.01em; }
    .cover .title { margin-top: 2.6in; }
    .cover .eyebrow { color: ${COLORS.lime}; font-size: 11pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 14px; }
    .cover h1 { color: white; font-size: 42pt; line-height: 1.05; }
    .cover h1 em { font-style: normal; color: ${COLORS.lime}; }
    .cover .tagline { color: rgba(255,255,255,0.78); margin-top: 18px; font-size: 13pt; max-width: 5.5in; }
    .cover .meta { position: absolute; left: 0.85in; bottom: 0.85in; right: 0.85in; display: flex; justify-content: space-between; align-items: flex-end; color: rgba(255,255,255,0.65); font-size: 10pt; }
    .cover .meta strong { color: white; display: block; font-weight: 600; font-size: 11pt; margin-bottom: 4px; }

    /* Section header */
    .section-head { border-bottom: 1px solid ${COLORS.line}; padding-bottom: 18px; margin-bottom: 28px; }
    .section-head .eyebrow { color: ${COLORS.green}; font-size: 10pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px; }
    .section-head h2 { color: ${COLORS.ink}; }

    /* Two col */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
    .col p + h3 { margin-top: 18px; }
    .col h3 { color: ${COLORS.greenDeep}; text-transform: none; letter-spacing: 0; font-size: 12pt; margin-bottom: 6px; }

    /* KPI grid */
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-top: 18px; }
    .kpi-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .kpi { border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 16px; }
    .kpi .label { font-size: 9pt; color: ${COLORS.faint}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
    .kpi .value { font-size: 22pt; font-weight: 700; color: ${COLORS.greenDeep}; letter-spacing: -0.02em; }
    .kpi .sub { font-size: 9.5pt; color: ${COLORS.mute}; margin-top: 6px; }
    .kpi.dark { background: ${COLORS.greenDark}; border-color: ${COLORS.greenDark}; }
    .kpi.dark .label { color: rgba(255,255,255,0.65); }
    .kpi.dark .value { color: white; }
    .kpi.dark .sub { color: ${COLORS.lime}; }
    .kpi.cream { background: ${COLORS.palegreen}; border-color: ${COLORS.palegreen}; }

    /* Table */
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10.5pt; }
    th { text-align: left; font-size: 9pt; color: ${COLORS.faint}; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; padding: 10px 8px; border-bottom: 1px solid ${COLORS.line}; }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td { padding: 11px 8px; border-bottom: 1px solid ${COLORS.line}; color: ${COLORS.ink}; }
    tr.total td { font-weight: 700; color: ${COLORS.greenDeep}; border-bottom: none; border-top: 2px solid ${COLORS.greenDeep}; background: ${COLORS.palegreen}; }
    .pl-table td.label { color: ${COLORS.mute}; font-size: 11pt; }
    .pl-table td.amount { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .pl-table .neg { color: #b91c1c; }

    /* Bullet list */
    .bullets { list-style: none; padding: 0; margin-top: 14px; }
    .bullets li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; align-items: flex-start; padding: 8px 0; font-size: 11pt; color: ${COLORS.ink}; }
    .bullets li::before { content: ""; display: block; width: 8px; height: 8px; border-radius: 50%; background: ${COLORS.lime}; margin-top: 7px; grid-column: 1; }
    .bullets li span { grid-column: 2; }
    .bullets li strong { color: ${COLORS.greenDeep}; }

    /* Pill */
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: ${COLORS.palegreen}; color: ${COLORS.greenDeep}; font-size: 9pt; font-weight: 600; letter-spacing: 0.02em; }

    /* Bar chart */
    .bar-chart { margin-top: 22px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; align-items: end; height: 2.2in; padding: 0 4px; border-bottom: 1px solid ${COLORS.line}; }
    .bar-col { display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
    .bar { width: 100%; background: linear-gradient(180deg, ${COLORS.lime} 0%, ${COLORS.green} 100%); border-radius: 4px 4px 0 0; }
    .bar-col .lbl { font-size: 8.5pt; color: ${COLORS.faint}; }
    .bar-col .v { font-size: 9pt; color: ${COLORS.greenDeep}; font-weight: 600; }
  `;

  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="PennyLime"/>`
    : "";

  const footer = `
    <div class="footer">
      <div class="mark">${logoImg}<span>PennyLime — 770 Technology Way LLC</span></div>
      <div>Confidential · 2026 Partner Deck</div>
    </div>`;

  // Bar chart: scale profit columns to chart height
  const maxProfit = Math.max(...RAMP.map((r) => r.profit));
  const bars = RAMP.map((r) => {
    const h = Math.max(8, Math.round((r.profit / maxProfit) * 180));
    const short = r.month.split(" ")[0];
    return `
      <div class="bar-col">
        <div class="v">${fmtMoney(r.profit, { compact: true })}</div>
        <div class="bar" style="height:${h}px"></div>
        <div class="lbl">${short}</div>
      </div>`;
  }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><style>${styles}</style></head><body>

  <!-- ========== COVER ========== -->
  <section class="page cover">
    <div class="logo-row">${logoImg}<span>PennyLime</span></div>
    <div class="title">
      <div class="eyebrow">2026 Partner Deck</div>
      <h1>Cash advances built for <em>gig workers</em>.</h1>
      <p class="tagline">$100 to $10,000 in under 60 minutes. A new lending product targeting 60M+ U.S. gig workers underserved by traditional credit.</p>
    </div>
    <div class="meta">
      <div>
        <strong>770 Technology Way LLC</strong>
        Florida · Operated under the PennyLime brand
      </div>
      <div>
        <strong>May 2026</strong>
        Confidential
      </div>
    </div>
  </section>

  <!-- ========== OPPORTUNITY ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">01 · The Opportunity</div>
      <h2>A short-term capital gap, hiding in plain sight.</h2>
    </div>

    <p class="lead">60M+ Americans drive for Uber, deliver for DoorDash, or run a side hustle. Banks won't underwrite them. Payday lenders charge 400% APR with no transparency. We sit between the two: fast, weekly-repaid, fully disclosed.</p>

    <div class="kpi-grid cols-3" style="margin-top: 28px;">
      <div class="kpi"><div class="label">U.S. gig workforce</div><div class="value">60M+</div><div class="sub">Uber, Lyft, DoorDash, Amazon Flex, Instacart</div></div>
      <div class="kpi"><div class="label">Avg cash gap event</div><div class="value">3.4×</div><div class="sub">per worker per year (Fed SCF data)</div></div>
      <div class="kpi"><div class="label">Underwriting gap</div><div class="value">82%</div><div class="sub">denied by traditional unsecured lenders</div></div>
    </div>

    <div class="two-col" style="margin-top: 36px;">
      <div class="col">
        <h3>Why now</h3>
        <p>Plaid + Stripe + Increase unlocked instant bank verification and same-day ACH. Underwriting that took 5 days now happens in 12 minutes. The infrastructure to lend $2,500 profitably to a gig worker did not exist 5 years ago. It does now.</p>
      </div>
      <div class="col">
        <h3>Why us</h3>
        <p>Built end-to-end in 2026: AI risk scoring on real bank-transaction data, automated ACH disbursement, transparent weekly repayment schedule, no hidden fees. Engineered to scale without proportional headcount.</p>
      </div>
    </div>
    ${footer}
  </section>

  <!-- ========== PRODUCT ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">02 · The Product</div>
      <h2>From application to funded in under an hour.</h2>
    </div>

    <ul class="bullets">
      <li><span><strong>$100 — $10,000 cash advances.</strong> Average loan $2,500. Repaid in 8 weekly installments.</span></li>
      <li><span><strong>5% weekly factor fee.</strong> $2,500 advance is repaid at $3,500 across 8 weeks ($437.50 / week). 40% gross factor.</span></li>
      <li><span><strong>Instant bank connect.</strong> Plaid Auth + Identity + Asset Report parsed by AI to validate income, balance trend, and recurring deposit cadence.</span></li>
      <li><span><strong>AI risk analysis on Gemini.</strong> Scores each applicant on 14 features. Approves, declines, or routes to manual review with full reasoning.</span></li>
      <li><span><strong>Same-day ACH disbursement.</strong> Increase API pushes funds directly to the borrower's verified account.</span></li>
      <li><span><strong>Automated weekly debits.</strong> Charge date snapped to the day after each borrower's largest recurring income, when balance is freshest.</span></li>
      <li><span><strong>Transparent contract.</strong> Borrower must scroll the full receivables agreement and type-sign their name before disbursement. No hidden APR conversions.</span></li>
    </ul>
    ${footer}
  </section>

  <!-- ========== UNIT ECONOMICS ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">03 · Unit Economics</div>
      <h2>5% weekly fee · 8-week term · 40% factor rate.</h2>
    </div>

    <p class="lead">Pricing model: 5% factor fee charged weekly across 8 weeks. A $2,500 advance is repaid at <strong style="color:${COLORS.greenDeep}">$3,500</strong> (eight weekly debits of $437.50). After a conservative 25% default assumption and $100 blended CAC, base-case net contribution is <strong style="color:${COLORS.greenDeep}">$25 per loan</strong>. Default rate is the dominant lever, sized in the next section.</p>

    <div class="kpi-grid" style="margin-top: 24px;">
      <div class="kpi"><div class="label">Avg loan</div><div class="value">$2,500</div><div class="sub">disbursed</div></div>
      <div class="kpi"><div class="label">Avg repayment</div><div class="value">$3,500</div><div class="sub">1.40× over 8 weeks</div></div>
      <div class="kpi cream"><div class="label">Gross fee per loan</div><div class="value">$1,000</div><div class="sub">5% × 8 weeks of principal</div></div>
      <div class="kpi dark"><div class="label">Cycle ROI on capital</div><div class="value">~6.5%</div><div class="sub">annualized, before CAC</div></div>
    </div>

    <h3 style="margin-top: 36px; text-transform: none; letter-spacing: 0; color: ${COLORS.ink}; font-size: 13pt;">Loan-level P&L (25% default base case)</h3>
    <table class="pl-table">
      <tbody>
        <tr><td class="label">Capital disbursed</td><td class="amount">$(2,500.00)</td></tr>
        <tr><td class="label">Expected fees collected <span class="pill" style="margin-left:6px;">75% × $1,000</span></td><td class="amount">+ $750.00</td></tr>
        <tr><td class="label">Expected default principal loss <span class="pill" style="margin-left:6px; background:#fee2e2; color:#991b1b;">25% × $2,500</span></td><td class="amount neg">$(625.00)</td></tr>
        <tr><td class="label">Customer acquisition cost</td><td class="amount neg">$(100.00)</td></tr>
        <tr class="total"><td>Net contribution per loan</td><td class="num">$25.00</td></tr>
      </tbody>
    </table>
    ${footer}
  </section>

  <!-- ========== DEFAULT SENSITIVITY ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">04 · Default Sensitivity</div>
      <h2>Default rate is the entire game.</h2>
    </div>

    <p class="lead">At 25% default, each loan nets only $25. Drop default to industry-typical ranges and the picture flips. AI risk scoring on bank-transaction data targets <strong style="color:${COLORS.greenDeep}">sub-15% default</strong>; first-pay default tightened through tuned approval thresholds and snapped-debit timing.</p>

    <table style="margin-top: 24px;">
      <thead>
        <tr>
          <th>Default rate</th>
          <th class="num">Expected fees</th>
          <th class="num">Principal loss</th>
          <th class="num">Net per loan (after CAC)</th>
          <th class="num">2026 net (810 loans)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>30% (stress)</td><td class="num">$700</td><td class="num">$(750)</td><td class="num" style="color:#b91c1c;">$(150)</td><td class="num" style="color:#b91c1c;">$(121,500)</td></tr>
        <tr><td>25% (base case)</td><td class="num">$750</td><td class="num">$(625)</td><td class="num">$25</td><td class="num">$20,250</td></tr>
        <tr><td>20%</td><td class="num">$800</td><td class="num">$(500)</td><td class="num">$200</td><td class="num">$162,000</td></tr>
        <tr><td>15% (industry typical)</td><td class="num">$850</td><td class="num">$(375)</td><td class="num">$375</td><td class="num">$303,750</td></tr>
        <tr class="total"><td>12% (target)</td><td class="num">$880</td><td class="num">$(300)</td><td class="num">$480</td><td class="num">$388,800</td></tr>
        <tr><td>10% (upside)</td><td class="num">$900</td><td class="num">$(250)</td><td class="num">$550</td><td class="num">$445,500</td></tr>
      </tbody>
    </table>

    <div class="kpi-grid cols-3" style="margin-top: 32px;">
      <div class="kpi"><div class="label">Break-even default</div><div class="value">~22%</div><div class="sub">where net per loan = $0</div></div>
      <div class="kpi cream"><div class="label">2026 target default</div><div class="value">12%</div><div class="sub">$389K net contribution</div></div>
      <div class="kpi dark"><div class="label">AI risk model</div><div class="value">Live</div><div class="sub">14 features, Gemini-powered</div></div>
    </div>
    ${footer}
  </section>

  <!-- ========== ACQUISITION ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">05 · Acquisition Strategy</div>
      <h2>$100 blended CAC, weighted toward organic.</h2>
    </div>

    <p class="lead">Acquisition mix is the key lever. 20% organic at zero marginal cost, 80% paid at $125 to clear the $100 blended target. Built SEO surface across <strong>26 platform-specific landing pages</strong> (Uber, DoorDash, Amazon Flex, Instacart, etc.) plus state-law pages and a content engine publishing every 48 hours.</p>

    <div class="kpi-grid cols-3" style="margin-top: 24px;">
      <div class="kpi"><div class="label">Organic share</div><div class="value">20%</div><div class="sub">SEO + referral · $0 marginal</div></div>
      <div class="kpi"><div class="label">Paid share</div><div class="value">80%</div><div class="sub">Google, Meta, TikTok · $125 CAC</div></div>
      <div class="kpi cream"><div class="label">Blended CAC</div><div class="value">$100</div><div class="sub">per funded loan</div></div>
    </div>

    <div class="two-col" style="margin-top: 32px;">
      <div class="col">
        <h3>Paid media</h3>
        <p>TikTok and Meta primary. Targeting: U.S. drivers + delivery workers, 21-55, 30-day shopping intent. Direct response landing pages already shipped per platform. Tracking via conversion API into Increase funding event.</p>
      </div>
      <div class="col">
        <h3>Organic</h3>
        <p>140+ SEO pages live across platform names, state law, and educational content. AI-driven calendar publishes blog content every 48 hours. Target: 160 funded loans from organic in 2026 (13/month average).</p>
      </div>
    </div>
    ${footer}
  </section>

  <!-- ========== MONTHLY RAMP ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">06 · 2026 Monthly Ramp</div>
      <h2>810 funded loans. $2.0M deployed. $608K fee revenue.</h2>
    </div>

    <div class="bar-chart">${bars}</div>
    <p style="text-align: center; margin-top: 8px; font-size: 9pt; color: ${COLORS.faint};">Monthly contribution after default + CAC, base case 25% default · May - Dec 2026</p>

    <table style="margin-top: 24px;">
      <thead>
        <tr>
          <th>Month</th>
          <th class="num">Funded loans</th>
          <th class="num">Capital out</th>
          <th class="num">Expected revenue</th>
          <th class="num">Net profit</th>
        </tr>
      </thead>
      <tbody>
        ${RAMP.map(
          (r) => `<tr>
          <td>${r.month}</td>
          <td class="num">${r.funded}</td>
          <td class="num">${fmtMoney(r.capital)}</td>
          <td class="num">${fmtMoney(r.revenue)}</td>
          <td class="num">${fmtMoney(r.profit)}</td>
        </tr>`,
        ).join("")}
        <tr class="total">
          <td>2026 Total</td>
          <td class="num">${TOTAL.funded}</td>
          <td class="num">${fmtMoney(TOTAL.capital)}</td>
          <td class="num">${fmtMoney(TOTAL.revenue)}</td>
          <td class="num">${fmtMoney(TOTAL.profit)}</td>
        </tr>
      </tbody>
    </table>
    ${footer}
  </section>

  <!-- ========== YEAR P&L ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">07 · 2026 P&L Snapshot</div>
      <h2>Two scenarios. Default rate decides which one we live in.</h2>
    </div>

    <p class="lead">810 funded loans, $2.0M deployed, $607.5K in expected fees collected after default. Working capital recycles ~6.5× per year on 8-week loan cycles. Net result hinges almost entirely on default rate.</p>

    <div class="two-col" style="margin-top: 24px;">
      <div class="col">
        <h3 style="color: ${COLORS.mute}; text-transform: uppercase; font-size: 10pt; letter-spacing: 0.06em;">Base case · 25% default</h3>
        <table class="pl-table" style="margin-top: 8px;">
          <tbody>
            <tr><td class="label">Fee revenue collected</td><td class="amount">+ $607,500</td></tr>
            <tr><td class="label">Default principal loss</td><td class="amount neg">$(506,250)</td></tr>
            <tr><td class="label">CAC (810 × $100)</td><td class="amount neg">$(81,000)</td></tr>
            <tr><td class="label">OpEx</td><td class="amount neg">$(120,000)</td></tr>
            <tr class="total"><td>Net</td><td class="num" style="color:#b91c1c; background:#fef2f2; border-top-color:#b91c1c;">$(99,750)</td></tr>
          </tbody>
        </table>
      </div>
      <div class="col">
        <h3 style="color: ${COLORS.greenDeep}; text-transform: uppercase; font-size: 10pt; letter-spacing: 0.06em;">Target · 12% default</h3>
        <table class="pl-table" style="margin-top: 8px;">
          <tbody>
            <tr><td class="label">Fee revenue collected</td><td class="amount">+ $712,800</td></tr>
            <tr><td class="label">Default principal loss</td><td class="amount neg">$(243,000)</td></tr>
            <tr><td class="label">CAC (810 × $100)</td><td class="amount neg">$(81,000)</td></tr>
            <tr><td class="label">OpEx</td><td class="amount neg">$(120,000)</td></tr>
            <tr class="total"><td>Net</td><td class="num">$268,800</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="kpi-grid cols-3" style="margin-top: 32px;">
      <div class="kpi"><div class="label">Capital deployed 2026</div><div class="value">$2.0M</div><div class="sub">810 loans × $2,500</div></div>
      <div class="kpi cream"><div class="label">Cycle recycle rate</div><div class="value">6.5×</div><div class="sub">52 weeks ÷ 8-week loan</div></div>
      <div class="kpi dark"><div class="label">Peak working capital</div><div class="value">~$500K</div><div class="sub">Q4 2026</div></div>
    </div>
    ${footer}
  </section>

  <!-- ========== RISK / WORKING CAPITAL ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">08 · Risk &amp; Working Capital</div>
      <h2>What we watch. What can go wrong.</h2>
    </div>

    <div class="two-col">
      <div class="col">
        <h3>Working capital</h3>
        <p>Loans run 8 weeks. Capital recycles ~6.5× per year. To fund 250 advances in December, roughly <strong style="color:${COLORS.greenDeep}">$500K</strong> of capital must be revolving in the Increase account by mid-November. Peak Q4 working capital requirement: $500K-$600K before December collections cycle back.</p>

        <h3 style="margin-top:18px;">Default is the lever</h3>
        <p>Base case: 25% default. Each 3-point reduction in default = ~$120K of additional net profit. Holding default under 18% turns the year profitable. AI risk score + tuned approval thresholds + snapped weekly debit timing all target <strong style="color:${COLORS.greenDeep}">12% default by year-end</strong>.</p>
      </div>
      <div class="col">
        <h3>Regulatory posture</h3>
        <p>Operated as merchant-cash-advance product (receivables purchase) rather than consumer loan. Florida-domiciled under 770 Technology Way LLC. Reviewed by counsel before each new state launch. No interest-rate-bearing instruments.</p>

        <h3 style="margin-top:18px;">Repeat customer upside</h3>
        <p>Not modeled above. Industry benchmark: 30% of paid-off borrowers take a second advance within 60 days. Repeat loans carry effectively zero CAC. If achieved, blended CAC drops ~18% in H2 2026, adding roughly <strong style="color:${COLORS.greenDeep}">$15K-$25K</strong> to net contribution. Pure upside on the target scenario.</p>
      </div>
    </div>

    <div class="kpi-grid cols-3" style="margin-top: 32px;">
      <div class="kpi"><div class="label">Default · Stress (30%)</div><div class="value" style="color:#b91c1c;">$(122K)</div><div class="sub">2026 net contribution</div></div>
      <div class="kpi"><div class="label">Default · Base (25%)</div><div class="value" style="color:#b45309;">$(100K)</div><div class="sub">2026 net contribution</div></div>
      <div class="kpi cream"><div class="label">Default · Target (12%)</div><div class="value">$269K</div><div class="sub">2026 net contribution</div></div>
    </div>
    ${footer}
  </section>

  <!-- ========== ASK ========== -->
  <section class="page cover">
    <div class="logo-row">${logoImg}<span>PennyLime</span></div>
    <div class="title">
      <div class="eyebrow">Let's talk</div>
      <h1>Looking for capital partners to <em>fund the ramp</em>.</h1>
      <p class="tagline">Peak working capital need in Q4 2026 is $500K-$600K on 8-week loan cycles. The product is live, the disbursement infrastructure is built, the SEO surface is in market. The remaining variable is loan-book capital and tightening default to the 12% target.</p>
    </div>
    <div class="meta">
      <div>
        <strong>Bar Elezra</strong>
        bar@albert-capital.com
      </div>
      <div>
        <strong>PennyLime · 2026</strong>
        770 Technology Way LLC
      </div>
    </div>
  </section>

</body></html>`;
}

export async function generatePartnerDeckPdf(): Promise<Buffer> {
  const logo = await loadLogoDataUri();
  const html = buildDeckHtml(logo);
  return renderHtmlToPdf(html);
}

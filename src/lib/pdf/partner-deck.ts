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

const RAMP: MonthRow[] = [
  { month: "May 2026", funded: 5, capital: 12_500, revenue: 23_438, profit: 9_938 },
  { month: "Jun 2026", funded: 15, capital: 37_500, revenue: 70_313, profit: 29_813 },
  { month: "Jul 2026", funded: 30, capital: 75_000, revenue: 140_625, profit: 59_625 },
  { month: "Aug 2026", funded: 60, capital: 150_000, revenue: 281_250, profit: 119_250 },
  { month: "Sep 2026", funded: 100, capital: 250_000, revenue: 468_750, profit: 198_750 },
  { month: "Oct 2026", funded: 150, capital: 375_000, revenue: 703_125, profit: 298_125 },
  { month: "Nov 2026", funded: 200, capital: 500_000, revenue: 937_500, profit: 397_500 },
  { month: "Dec 2026", funded: 250, capital: 625_000, revenue: 1_171_875, profit: 497_125 },
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
      <li><span><strong>$100 — $10,000 cash advances.</strong> Average loan $2,500. Repaid in 12 weekly installments.</span></li>
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
      <h2>Every $2,500 loan returns $2,088 net.</h2>
    </div>

    <p class="lead">Pricing model: 150% return on capital deployed. A $2,500 advance is repaid at $6,250 across 12 weeks. After a conservative 25% default assumption, each funded loan nets the business <strong style="color:${COLORS.greenDeep}">$2,087.50</strong>.</p>

    <div class="kpi-grid" style="margin-top: 24px;">
      <div class="kpi"><div class="label">Avg loan</div><div class="value">$2,500</div><div class="sub">disbursed</div></div>
      <div class="kpi"><div class="label">Avg repayment</div><div class="value">$6,250</div><div class="sub">2.5× over 12 weeks</div></div>
      <div class="kpi cream"><div class="label">Net per loan</div><div class="value">$2,088</div><div class="sub">after default + CAC</div></div>
      <div class="kpi dark"><div class="label">Margin on capital</div><div class="value">83.5%</div><div class="sub">net contribution</div></div>
    </div>

    <h3 style="margin-top: 36px; text-transform: none; letter-spacing: 0; color: ${COLORS.ink}; font-size: 13pt;">Loan-level P&L</h3>
    <table class="pl-table">
      <tbody>
        <tr><td class="label">Capital disbursed</td><td class="amount">$(2,500)</td></tr>
        <tr><td class="label">Expected repayment <span class="pill" style="margin-left:6px;">75% × $6,250</span></td><td class="amount">+ $4,687.50</td></tr>
        <tr><td class="label">Expected default loss <span class="pill" style="margin-left:6px; background:#fee2e2; color:#991b1b;">25% × $2,500</span></td><td class="amount neg">$(625.00)</td></tr>
        <tr><td class="label">Customer acquisition cost</td><td class="amount neg">$(100.00)</td></tr>
        <tr class="total"><td>Net contribution per loan</td><td class="num">$2,087.50</td></tr>
      </tbody>
    </table>
    ${footer}
  </section>

  <!-- ========== ACQUISITION ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">04 · Acquisition Strategy</div>
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
      <div class="eyebrow">05 · 2026 Monthly Ramp</div>
      <h2>810 funded loans. $2.0M deployed. $1.6M net.</h2>
    </div>

    <div class="bar-chart">${bars}</div>
    <p style="text-align: center; margin-top: 8px; font-size: 9pt; color: ${COLORS.faint};">Monthly net profit, May - Dec 2026</p>

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
      <div class="eyebrow">06 · 2026 P&L Snapshot</div>
      <h2>Net profit ≈ $1.49M on $2.0M deployed.</h2>
    </div>

    <table class="pl-table" style="margin-top: 18px;">
      <tbody>
        <tr><td class="label">Capital deployed (810 loans × $2,500)</td><td class="amount">$(2,025,000)</td></tr>
        <tr><td class="label">Gross collected (after 25% default)</td><td class="amount">+ $3,800,000</td></tr>
        <tr><td class="label">Default principal loss (203 loans × $2,500)</td><td class="amount neg">$(506,250)</td></tr>
        <tr><td class="label">Marketing / CAC (810 × $100)</td><td class="amount neg">$(81,000)</td></tr>
        <tr><td class="label">OpEx (hosting, Plaid, Twilio, Resend, Increase, ops)</td><td class="amount neg">$(120,000)</td></tr>
        <tr class="total"><td>Net profit, 2026</td><td class="num">$1,490,000</td></tr>
      </tbody>
    </table>

    <div class="kpi-grid cols-3" style="margin-top: 36px;">
      <div class="kpi cream"><div class="label">Net margin on revenue</div><div class="value">39%</div><div class="sub">$1.49M / $3.80M collected</div></div>
      <div class="kpi cream"><div class="label">Return on capital</div><div class="value">74%</div><div class="sub">$1.49M / $2.03M deployed</div></div>
      <div class="kpi dark"><div class="label">Peak capital need</div><div class="value">~$700K</div><div class="sub">Q4 working capital</div></div>
    </div>
    ${footer}
  </section>

  <!-- ========== RISK / WORKING CAPITAL ========== -->
  <section class="page">
    <div class="section-head">
      <div class="eyebrow">07 · Risk &amp; Working Capital</div>
      <h2>What we watch. What can go wrong.</h2>
    </div>

    <div class="two-col">
      <div class="col">
        <h3>Working capital</h3>
        <p>Loans run roughly 12 weeks. To fund 250 advances in December, ~$500K of capital must be revolving in the Increase account by November. Peak capital requirement across Q4 lands at <strong style="color:${COLORS.greenDeep}">$600K-$750K</strong> before December collections cycle back.</p>

        <h3 style="margin-top:18px;">Default sensitivity</h3>
        <p>Base case: 25% default. Each 1 point of default = ~$20K of net profit. Hitting 30% default drops net to ~$1.05M. Holding under 22% pushes net above $1.7M. AI risk score + auto-decline thresholds tuned monthly.</p>
      </div>
      <div class="col">
        <h3>Regulatory posture</h3>
        <p>Operated as merchant-cash-advance product (receivables purchase) rather than consumer loan. Florida-domiciled. Reviewed by counsel before each new state launch. No interest-rate-bearing instruments.</p>

        <h3 style="margin-top:18px;">Repeat customer upside</h3>
        <p>Not modeled above. Industry benchmark: 30% of paid-off borrowers take a second advance within 90 days. If achieved, blended CAC drops ~18% in H2 2026 and adds roughly $200K to net profit. Pure upside.</p>
      </div>
    </div>

    <div class="kpi-grid cols-3" style="margin-top: 32px;">
      <div class="kpi"><div class="label">Default · Base case</div><div class="value" style="color:${COLORS.greenDeep};">25%</div><div class="sub">Net $1.49M</div></div>
      <div class="kpi"><div class="label">Default · Stress</div><div class="value" style="color:#b91c1c;">30%</div><div class="sub">Net ~$1.05M</div></div>
      <div class="kpi cream"><div class="label">Default · Upside</div><div class="value">22%</div><div class="sub">Net ~$1.72M</div></div>
    </div>
    ${footer}
  </section>

  <!-- ========== ASK ========== -->
  <section class="page cover">
    <div class="logo-row">${logoImg}<span>PennyLime</span></div>
    <div class="title">
      <div class="eyebrow">Let's talk</div>
      <h1>Looking for capital partners to <em>fund the ramp</em>.</h1>
      <p class="tagline">Peak working capital need in Q4 2026 is $700K. The product is live, the disbursement infrastructure is built, the SEO surface is in market. The remaining variable is loan-book capital.</p>
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

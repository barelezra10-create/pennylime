/**
 * CFDL disclosure template. Single base form with state-specific footer +
 * jurisdiction statement. Fields conform to the union of NY / CA / UT /
 * VA / GA requirements:
 *
 *   - Disbursement amount
 *   - Finance charge (total cost)
 *   - Total payment amount
 *   - APR-equivalent
 *   - Estimated term + payment frequency
 *   - Specified percentage
 *   - Prepayment policy
 *   - Collateral statement (we don't take collateral)
 *
 * Output is plain HTML for both inline rendering on the offer page
 * (scroll-and-sign) and the puppeteer-rendered PDF retained as evidence.
 */

import type { CfdlState } from "./state-requirements";
import { getStateName, getStateStatute } from "./state-requirements";

export type DisclosureInputs = {
  merchantLegalName: string;
  merchantState: CfdlState;
  disbursedAmount: number;
  totalRepayment: number;
  financeCharge: number;
  aprPercent: number;
  termDays: number;
  termWeeks: number;
  weeklyPayment: number;
  specifiedPercent: number;
  effectiveDate: string; // ISO date
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function renderDisclosureHtml(input: DisclosureInputs): string {
  const stateName = getStateName(input.merchantState);
  const statute = getStateStatute(input.merchantState);

  return `
<article class="cfdl-disclosure">
  <header>
    <h1>Commercial Financing Disclosure</h1>
    <p class="lede">
      Required by ${statute}. PennyLime is providing this disclosure before you sign the Receivables Purchase Agreement so you can compare this offer to other financing options.
    </p>
    <p class="meta">
      <strong>Merchant:</strong> ${input.merchantLegalName}<br/>
      <strong>State of business:</strong> ${stateName}<br/>
      <strong>Effective date:</strong> ${new Date(input.effectiveDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}<br/>
      <strong>Provider:</strong> 770 Technology LLC d/b/a PennyLime
    </p>
  </header>

  <section class="disclosure-box">
    <h2>Cost of this financing</h2>
    <table>
      <tbody>
        <tr>
          <th>Amount financed (disbursed to you)</th>
          <td class="amount">${fmtMoney(input.disbursedAmount)}</td>
        </tr>
        <tr>
          <th>Finance charge (cost of financing)</th>
          <td class="amount">${fmtMoney(input.financeCharge)}</td>
        </tr>
        <tr>
          <th>Total payment amount</th>
          <td class="amount strong">${fmtMoney(input.totalRepayment)}</td>
        </tr>
        <tr class="rate-row">
          <th>Estimated Annual Percentage Rate (APR)</th>
          <td class="amount apr">${fmtPct(input.aprPercent)}</td>
        </tr>
      </tbody>
    </table>
    <p class="apr-note">
      The APR is an estimate based on the expected ${input.termDays}-day repayment schedule. The APR is not the interest rate you will be charged — this transaction is a sale of future receivables, not a loan. We use the APR to help you compare the cost of this advance against other forms of financing. If you deliver the Purchased Receivables faster than scheduled, the effective APR will be higher; if slower, it will be lower.
    </p>
  </section>

  <section>
    <h2>Repayment schedule</h2>
    <table>
      <tbody>
        <tr>
          <th>Estimated term</th>
          <td>${input.termWeeks} weeks (${input.termDays} days)</td>
        </tr>
        <tr>
          <th>Payment frequency</th>
          <td>Weekly</td>
        </tr>
        <tr>
          <th>Estimated weekly payment</th>
          <td>${fmtMoney(input.weeklyPayment)}</td>
        </tr>
        <tr>
          <th>Specified percentage of receivables remitted</th>
          <td>${fmtPct(input.specifiedPercent)} of each business payment received until total payment amount is delivered</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Prepayment policy</h2>
    <p>
      You may deliver the full remaining Purchased Receivables at any time without any prepayment penalty, fee, or premium. The total payment amount does not change based on speed of remittance — if you remit faster, your effective cost goes up because you have the funds for less time. We do not charge any additional fees for early payoff.
    </p>
  </section>

  <section>
    <h2>Collateral and personal guarantees</h2>
    <p>
      <strong>This transaction is unsecured.</strong> PennyLime does not take a security interest in your business assets, inventory, equipment, or real estate. The Receivables Purchase Agreement is enforceable as a sale of future receivables, not as a secured loan.
    </p>
    <p>
      If you sign the Receivables Purchase Agreement as the individual owner of a sole proprietorship, you are personally responsible for delivering the Purchased Receivables. If you sign on behalf of a registered business entity (LLC, corporation, partnership), no personal guarantee is required.
    </p>
  </section>

  <section>
    <h2>Right to compare</h2>
    <p>
      You have the right to obtain financing from other providers. The cost shown above is specific to this PennyLime offer. Other commercial financing products (bank business loans, SBA loans, credit lines, factoring, etc.) may have lower or higher costs and different terms. We encourage you to compare offers before signing.
    </p>
  </section>

  <section>
    <h2>Right to a copy</h2>
    <p>
      A copy of this disclosure will be delivered to you electronically immediately after you sign, and will remain accessible from your customer account at <a href="https://pennylime.com/portal">pennylime.com/portal</a>. You may also request a copy at any time by emailing <a href="mailto:info@pennylime.com">info@pennylime.com</a>.
    </p>
  </section>

  <section>
    <h2>State law jurisdiction</h2>
    <p>
      This disclosure is being provided under ${statute}. If you believe any of the information above is incorrect, do not sign the Receivables Purchase Agreement and contact us at the email above before proceeding. PennyLime is committed to providing accurate disclosures and will correct any error before you sign.
    </p>
  </section>
</article>
  `.trim();
}

export const DISCLOSURE_CSS = `
.cfdl-disclosure { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #0a0a0a; line-height: 1.55; }
.cfdl-disclosure header { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #e4e4e7; }
.cfdl-disclosure h1 { font-size: 22pt; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; color: #15803d; }
.cfdl-disclosure h2 { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 10px; color: #0a0a0a; }
.cfdl-disclosure .lede { font-size: 11pt; color: #52525b; margin: 0 0 12px; }
.cfdl-disclosure .meta { font-size: 10.5pt; color: #27272a; margin: 0; }
.cfdl-disclosure section { margin-bottom: 24px; }
.cfdl-disclosure table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
.cfdl-disclosure table th { text-align: left; padding: 8px 8px 8px 0; color: #52525b; font-weight: 500; width: 55%; vertical-align: top; }
.cfdl-disclosure table td { padding: 8px 0; text-align: right; font-weight: 600; }
.cfdl-disclosure table td.amount { font-variant-numeric: tabular-nums; }
.cfdl-disclosure table td.strong { font-weight: 700; font-size: 11.5pt; }
.cfdl-disclosure .disclosure-box { background: #f0fdf4; border: 1px solid #15803d; border-radius: 10px; padding: 18px 20px; }
.cfdl-disclosure .disclosure-box .rate-row th { color: #15803d; font-weight: 700; font-size: 11pt; padding-top: 12px; border-top: 1px solid #bbf7d0; }
.cfdl-disclosure .disclosure-box .rate-row td.apr { color: #15803d; font-weight: 800; font-size: 14pt; padding-top: 12px; border-top: 1px solid #bbf7d0; }
.cfdl-disclosure .apr-note { font-size: 10pt; color: #52525b; margin-top: 14px; }
.cfdl-disclosure section p { font-size: 10.5pt; color: #27272a; margin: 0 0 8px; }
.cfdl-disclosure a { color: #15803d; }
`;

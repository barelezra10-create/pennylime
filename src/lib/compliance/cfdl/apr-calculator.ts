/**
 * APR-equivalent calculation for factor-rate transactions.
 *
 * The merchant cash advance product doesn't charge interest in the
 * traditional sense — we purchase future receivables at a discount. But
 * CFDL requires us to disclose an "estimated APR" so merchants can
 * compare against bank loans and SBA financing. We use the standard
 * CFDL formula:
 *
 *   APR = ((total_repayment - disbursed) / disbursed) × (365 / term_days)
 *
 * Where `term_days` is the expected number of days from disbursement
 * to final delivery of the Purchased Receivables. For PennyLime's
 * 8-week schedule that's 56 days.
 *
 * The "estimated" qualifier matters: if collection takes longer than
 * the scheduled term (which happens with factor-rate products by
 * design — there's no fixed term), the effective APR comes DOWN, not
 * up. The CFDL safe-harbor is the term-based estimate at disclosure
 * time, not the realized number.
 */

export type AprInputs = {
  disbursedAmount: number;
  totalRepayment: number;
  termDays: number;
};

export type AprResult = {
  financeCharge: number;
  factorRate: number;
  aprPercent: number; // e.g. 261.4 for 261.4%
};

export function calculateApr(input: AprInputs): AprResult {
  if (input.disbursedAmount <= 0) {
    return { financeCharge: 0, factorRate: 1, aprPercent: 0 };
  }
  if (input.termDays <= 0) {
    return { financeCharge: 0, factorRate: 1, aprPercent: 0 };
  }
  const financeCharge = Math.max(0, input.totalRepayment - input.disbursedAmount);
  const factorRate = input.totalRepayment / input.disbursedAmount;
  const aprPercent = (financeCharge / input.disbursedAmount) * (365 / input.termDays) * 100;
  return {
    financeCharge: Math.round(financeCharge * 100) / 100,
    factorRate: Math.round(factorRate * 10000) / 10000,
    aprPercent: Math.round(aprPercent * 100) / 100,
  };
}

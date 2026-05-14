/**
 * PennyLime cash-advance pricing math.
 *
 * Product structure: not a loan. The advance accrues at a **weekly rate**
 * compounded on the outstanding balance. The customer chooses a term in
 * weeks; total repaid is principal × (1 + rate)^weeks, divided into equal
 * weekly remittances. Term length does not affect the rate — the rate is
 * driven entirely by risk score.
 *
 * Examples (5% weekly, equal payments):
 *   $500 over 4 weeks  → $500 × 1.05^4 = $607.75 total → $151.94 / week
 *   $500 over 6 weeks  → $500 × 1.05^6 = $670.05 total → $111.67 / week
 *   $500 over 10 weeks → $500 × 1.05^10 = $814.45 total → $81.45 / week
 */

export type CashAdvanceTerms = {
  principal: number;
  weeklyRate: number;
  termWeeks: number;
  totalRepayment: number;
  totalCostOfCapital: number;
  weeklyPayment: number;
};

export function computeAdvanceTerms(input: {
  principal: number;
  weeklyRate: number; // e.g. 5 for 5%
  termWeeks: number;
}): CashAdvanceTerms {
  const r = input.weeklyRate / 100;
  const totalRepayment = round2(input.principal * Math.pow(1 + r, input.termWeeks));
  const totalCostOfCapital = round2(totalRepayment - input.principal);
  const weeklyPayment = round2(totalRepayment / input.termWeeks);
  return {
    principal: input.principal,
    weeklyRate: input.weeklyRate,
    termWeeks: input.termWeeks,
    totalRepayment,
    totalCostOfCapital,
    weeklyPayment,
  };
}

/**
 * Generates 2–3 suggested term options for the offer page. Bar's rules:
 * - Min 4 weeks, max 10 weeks.
 * - Customer-facing range that lets them trade speed vs weekly cash flow.
 */
export function suggestAdvanceTermOptions(input: {
  principal: number;
  weeklyRate: number;
  termOptionsWeeks?: number[];
}): CashAdvanceTerms[] {
  const weeks = input.termOptionsWeeks ?? [4, 6, 10];
  return weeks.map((termWeeks) =>
    computeAdvanceTerms({ principal: input.principal, weeklyRate: input.weeklyRate, termWeeks }),
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

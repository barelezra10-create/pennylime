const INPUT_PRICE_PER_M = 0.075;
const OUTPUT_PRICE_PER_M = 0.30;

export function tokensToCostCents(tokensIn: number, tokensOut: number): number {
  const dollars = (tokensIn * INPUT_PRICE_PER_M + tokensOut * OUTPUT_PRICE_PER_M) / 1_000_000;
  return dollars * 100;
}

// gemini-2.5-flash-lite pricing as of 2026-05-17 (ai.google.dev/pricing).
// If gemini.ts MODEL changes, update these.
const INPUT_PRICE_PER_M = 0.10;
const OUTPUT_PRICE_PER_M = 0.40;

export function tokensToCostCents(tokensIn: number, tokensOut: number): number {
  const dollars = (tokensIn * INPUT_PRICE_PER_M + tokensOut * OUTPUT_PRICE_PER_M) / 1_000_000;
  return dollars * 100;
}

import { describe, it, expect } from "vitest";
import { tokensToCostCents } from "./cost";

describe("tokensToCostCents", () => {
  it("computes Gemini Flash Lite cost for typical turn", () => {
    // Flash Lite pricing (May 2026): $0.10/M input, $0.40/M output
    // 1000 in + 500 out -> (1000 * 0.10 + 500 * 0.40) / 1_000_000 * 100 cents
    expect(tokensToCostCents(1000, 500)).toBeCloseTo(0.03, 4);
  });
  it("returns 0 for zero tokens", () => {
    expect(tokensToCostCents(0, 0)).toBe(0);
  });
});

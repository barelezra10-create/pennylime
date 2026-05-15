import { describe, it, expect } from "vitest";
import { tokensToCostCents } from "./cost";

describe("tokensToCostCents", () => {
  it("computes Gemini Flash cost for typical turn", () => {
    // Flash pricing (May 2026): $0.075/M input, $0.30/M output
    // 1000 in + 500 out → (1000 * 0.075 + 500 * 0.30) / 1_000_000 * 100 cents
    expect(tokensToCostCents(1000, 500)).toBeCloseTo(0.0225, 4);
  });
  it("returns 0 for zero tokens", () => {
    expect(tokensToCostCents(0, 0)).toBe(0);
  });
});

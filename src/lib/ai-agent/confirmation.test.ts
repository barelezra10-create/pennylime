import { describe, it, expect, vi } from "vitest";
import { issueToken, verifyToken } from "./confirmation";

describe("confirmation token", () => {
  it("verifies a fresh token for the same payload", () => {
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(true);
  });
  it("rejects token with different payload", () => {
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 200, date: "2026-05-20" })).toBe(false);
  });
  it("rejects expired token (>90s old)", () => {
    vi.useFakeTimers();
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    vi.advanceTimersByTime(91_000);
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(false);
    vi.useRealTimers();
  });
});
